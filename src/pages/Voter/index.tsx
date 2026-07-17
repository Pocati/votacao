// src/pages/Voter/index.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { db } from '../../services/firebase';
import {
    collection, onSnapshot, runTransaction, doc,
    query, orderBy, setDoc, getDoc
} from 'firebase/firestore';

interface PollData {
    id?: string;
    question: string;
    type: 'sim_nao' | 'quiz';
    options?: string[];
    correctOptionIndex?: number;
    status: 'preparada' | 'ativa' | 'encerrada';
    yesVotes?: number;
    noVotes?: number;
    createdAt: number;
    startedAt?: number;
}

interface Player {
    id: string;
    nickname: string;
    score: number;
}

export const VotingArea: React.FC = () => {
    const navigate = useNavigate();

    // Estado para gerenciar o apelido do jogador localmente
    const [nickname, setNickname] = useState<string>(localStorage.getItem('voter_nickname') || '');
    const [nicknameInput, setNicknameInput] = useState<string>('');
    const [registerLoading, setRegisterLoading] = useState<boolean>(false);

    // Estados da pergunta e votação
    const [activePoll, setActivePoll] = useState<PollData | null>(null);
    const [lastPoll, setLastPoll] = useState<PollData | null>(null);
    const [currentPollId, setCurrentPollId] = useState<string | null>(null);

    const [hasVoted, setHasVoted] = useState(false);
    const [selectedOptionIdx, setSelectedOptionIdx] = useState<number | null>(null);
    const [isRevealed, setIsRevealed] = useState(false);
    const [votingLocked, setVotingLocked] = useState(false);

    // Contagens regressivas (5 segundos)
    const [countdown, setCountdown] = useState<number>(5);
    const [nextPollCountdown, setNextPollCountdown] = useState<number>(5);

    // Controle de visibilidade externa do Ranking Geral
    const [showRanking, setShowRanking] = useState<boolean>(true);

    // Ranking local dos jogadores
    const [players, setPlayers] = useState<Player[]>([]);

    // 1. ESCUTA DE PERGUNTAS, JOGADORES E CONFIGURAÇÕES DO FIREBASE
    useEffect(() => {
        if (!nickname) return;

        // Escuta a coleção de perguntas
        const qPolls = query(collection(db, 'polls'), orderBy('createdAt', 'desc'));
        const unsubscribePolls = onSnapshot(qPolls, (snapshot) => {
            const nonPreparedDocs = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as PollData))
                .filter(poll => (poll.status as string) !== 'preparada');

            if (nonPreparedDocs.length > 0) {
                const latestDoc = nonPreparedDocs[0];

                if (latestDoc.id !== currentPollId) {
                    setCurrentPollId(latestDoc.id || null);
                    setHasVoted(false);
                    setSelectedOptionIdx(null);
                    setIsRevealed(false);
                    setVotingLocked(false);
                    setCountdown(5);
                    setNextPollCountdown(5);
                }

                if (latestDoc.status === 'ativa') {
                    setActivePoll(latestDoc);
                    setLastPoll(null);

                    if (latestDoc.startedAt) {
                        const timePassed = Math.floor((Date.now() - latestDoc.startedAt) / 1000);
                        const initialCountdown = 5 - timePassed;
                        if (initialCountdown > 0) {
                            setCountdown(initialCountdown);
                        } else {
                            setCountdown(0);
                            setIsRevealed(true);
                        }
                    }
                } else {
                    setActivePoll(null);
                    setLastPoll(latestDoc);
                }
            } else {
                setActivePoll(null);
                setLastPoll(null);
            }
        });

        // Escuta o ranking de jogadores
        const qPlayers = query(collection(db, 'players'), orderBy('score', 'desc'));
        const unsubscribePlayers = onSnapshot(qPlayers, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));
            setPlayers(list);
        });

        // Escuta configurações do Admin (Mostrar/Esconder ranking)
        const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'game'), (docSnap) => {
            if (docSnap.exists()) {
                setShowRanking(docSnap.data().showRanking ?? true);
            }
        });

        return () => {
            unsubscribePolls();
            unsubscribePlayers();
            unsubscribeSettings();
        };
    }, [nickname, currentPollId]);

    // 2. TICKER DA CONTAGEM REGRESSIVA INICIAL (5 segundos para ler a pergunta)
    useEffect(() => {
        if (activePoll && countdown > 0) {
            const timer = setTimeout(() => {
                setCountdown(prev => prev - 1);
            }, 1000);
            return () => clearTimeout(timer);
        } else if (activePoll && countdown === 0) {
            setIsRevealed(true);
        }
    }, [activePoll, countdown]);

    // 3. TICKER DA PRÓXIMA RODADA
    useEffect(() => {
        if (lastPoll && nextPollCountdown > 0) {
            const timer = setTimeout(() => {
                setNextPollCountdown(prev => prev - 1);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [lastPoll, nextPollCountdown]);

    // 4. ENVIO DE VOTOS
    const handleVote = async (optionIndex?: number) => {
        if (hasVoted || votingLocked || !currentPollId || !activePoll) return;

        setVotingLocked(true);
        setHasVoted(true);

        if (activePoll.type === 'quiz' && optionIndex !== undefined) {
            setSelectedOptionIdx(optionIndex);
            const isCorrect = optionIndex === activePoll.correctOptionIndex;

            if (isCorrect) {
                const timeElapsed = activePoll.startedAt ? (Date.now() - activePoll.startedAt) / 1000 : 5;
                const responseTime = Math.max(0, timeElapsed - 5);

                const speedBonus = Math.max(0, Math.round((10 - responseTime) * 5));
                const finalPoints = 100 + speedBonus;

                try {
                    const playerRef = doc(db, 'players', nickname);
                    await runTransaction(db, async (transaction) => {
                        const playerDoc = await transaction.get(playerRef);
                        if (!playerDoc.exists()) {
                            transaction.set(playerRef, { nickname, score: finalPoints });
                        } else {
                            const currentScore = playerDoc.data().score || 0;
                            transaction.update(playerRef, { score: currentScore + finalPoints });
                        }
                    });
                } catch (error) {
                    console.error("Erro ao somar pontos:", error);
                }
            }
        } else {
            const isYes = optionIndex === 0;
            try {
                const pollRef = doc(db, 'polls', currentPollId);
                await runTransaction(db, async (transaction) => {
                    const pollDoc = await transaction.get(pollRef);
                    if (!pollDoc.exists()) return;
                    const data = pollDoc.data();
                    if (isYes) {
                        transaction.update(pollRef, { yesVotes: (data.yesVotes || 0) + 1 });
                    } else {
                        transaction.update(pollRef, { noVotes: (data.noVotes || 0) + 1 });
                    }
                });
            } catch (error) {
                console.error("Erro ao processar voto Sim/Não:", error);
            }
        }
    };

    // 5. REGISTRO/ENTRADA DO APELIDO
    const handleJoinGame = async (e: React.FormEvent) => {
        e.preventDefault();
        const formattedNickname = nicknameInput.trim();
        if (!formattedNickname) return;

        setRegisterLoading(true);
        try {
            const playerRef = doc(db, 'players', formattedNickname);
            const playerSnap = await getDoc(playerRef);

            if (!playerSnap.exists()) {
                await setDoc(playerRef, {
                    nickname: formattedNickname,
                    score: 0
                });
            }

            localStorage.setItem('voter_nickname', formattedNickname);
            localStorage.setItem('user_role', 'voter');
            setNickname(formattedNickname);
        } catch (error) {
            console.error("Erro ao cadastrar apelido:", error);
            alert("Erro ao entrar no jogo. Tente outro apelido.");
        } finally {
            setRegisterLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('voter_nickname');
        localStorage.removeItem('user_role');
        setNickname('');
        setNicknameInput('');
    };

    if (!nickname) {
        return (
            <CenteredContainer>
                <JoinCard>
                    <JoinHeader>
                        <LogoIcon>🎮</LogoIcon>
                        <h2>Entrar no Jogo</h2>
                        <p>Escolha um apelido para participar das enquetes e acumular pontos!</p>
                    </JoinHeader>
                    <JoinForm onSubmit={handleJoinGame}>
                        <JoinInput
                            type="text"
                            placeholder="Digite seu apelido (Ex: DevMaster)..."
                            value={nicknameInput}
                            onChange={(e) => setNicknameInput(e.target.value)}
                            maxLength={15}
                            required
                        />
                        <JoinButton type="submit" disabled={registerLoading}>
                            {registerLoading ? 'Entrando...' : 'Começar a Jogar 🚀'}
                        </JoinButton>
                    </JoinForm>
                </JoinCard>
            </CenteredContainer>
        );
    }

    return (
        <Container>
            <Header>
                <UserBadge>👤 {nickname}</UserBadge>
                <LogoutButton onClick={handleLogout}>Sair</LogoutButton>
            </Header>

            {/* CASO 1: CONTAGEM REGRESSIVA */}
            {activePoll && !isRevealed && (
                <CenteredContainer>
                    <CountdownCard>
                        <p>Prepare-se para a pergunta!</p>
                        <TimerCircle>{countdown}</TimerCircle>
                        <QuestionPreview>"{activePoll.question}"</QuestionPreview>
                    </CountdownCard>
                </CenteredContainer>
            )}

            {/* CASO 2: PERGUNTA ATIVA E LIBERADA */}
            {activePoll && isRevealed && (
                <VotingSection>
                    <PollCard>
                        <QuestionTitle>"{activePoll.question}"</QuestionTitle>

                        {activePoll.type === 'sim_nao' ? (
                            <OptionsGrid>
                                <VoteButton
                                    onClick={() => handleVote(0)}
                                    disabled={hasVoted}
                                    voted={hasVoted && selectedOptionIdx === 0}
                                >
                                    🟢 SIM
                                </VoteButton>
                                <VoteButton
                                    onClick={() => handleVote(1)}
                                    disabled={hasVoted}
                                    voted={hasVoted && selectedOptionIdx === 1}
                                >
                                    🔴 NÃO
                                </VoteButton>
                            </OptionsGrid>
                        ) : (
                            <OptionsList>
                                {activePoll.options?.map((option, idx) => (
                                    <QuizOptionButton
                                        key={idx}
                                        onClick={() => handleVote(idx)}
                                        disabled={hasVoted}
                                        isSelected={selectedOptionIdx === idx}
                                    >
                                        {option}
                                    </QuizOptionButton>
                                ))}
                            </OptionsList>
                        )}

                        {hasVoted && (
                            <SuccessMsg>
                                {activePoll.type === 'quiz'
                                    ? "Resposta registrada! Aguarde o encerramento da rodada para ver o gabarito."
                                    : "Seu voto foi registrado com sucesso!"
                                }
                            </SuccessMsg>
                        )}
                    </PollCard>
                </VotingSection>
            )}

            {/* CASO 3: RODADA ENCERRADA */}
            {lastPoll && (
                <ResultsSection>
                    <CenteredContainer style={{ padding: 0 }}>
                        <ResultsCard>
                            <ResultHeader>
                                <h2>Rodada Finalizada!</h2>
                                <p>Prepare-se para a próxima rodada em: <strong>{nextPollCountdown}s</strong></p>
                            </ResultHeader>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <p style={{ fontStyle: 'italic', color: '#475569', marginBottom: '0.5rem' }}>Pergunta avaliada:</p>
                                <h3 style={{ fontSize: '1.1rem', color: '#1e293b' }}>"{lastPoll.question}"</h3>
                            </div>

                            {lastPoll.type === 'sim_nao' && (
                                <VotesStats>
                                    <StatBar>
                                        <span>🟢 Sim: <strong>{lastPoll.yesVotes || 0} votos</strong></span>
                                    </StatBar>
                                    <StatBar>
                                        <span>🔴 Não: <strong>{lastPoll.noVotes || 0} votos</strong></span>
                                    </StatBar>
                                </VotesStats>
                            )}

                            {lastPoll.type === 'quiz' && (
                                <GabaritoList>
                                    {lastPoll.options?.map((opt, idx) => {
                                        const isCorrect = idx === lastPoll.correctOptionIndex;
                                        return (
                                            <GabaritoItem key={idx} correct={isCorrect}>
                                                {opt} {isCorrect && '✅ (Correta)'}
                                            </GabaritoItem>
                                        );
                                    })}
                                </GabaritoList>
                            )}
                        </ResultsCard>
                    </CenteredContainer>

                    {/* EXIBIÇÃO CONDICIONAL DO RANKING DE ACORDO COM O ADMIN */}
                    {showRanking ? (
                        <RankingCard>
                            <h3>Placar Geral</h3>
                            <RankingList>
                                {players.map((player, index) => (
                                    <PlayerRow key={player.id} isMe={player.nickname === nickname}>
                                        <span className="pos">#{index + 1}</span>
                                        <span className="name">{player.nickname} {player.nickname === nickname && '(Você)'}</span>
                                        <span className="score">{player.score} pts</span>
                                    </PlayerRow>
                                ))}
                            </RankingList>
                        </RankingCard>
                    ) : (
                        <SuspenseCard>
                            <h3>Placar Geral</h3>
                            <div className="suspense-content">
                                <span className="icon">🔒</span>
                                <p>O placar geral foi ocultado temporariamente pelo Administrador para manter o suspense!</p>
                            </div>
                        </SuspenseCard>
                    )}
                </ResultsSection>
            )}

            {/* CASO 4: NENHUMA PERGUNTA ATIVA */}
            {!activePoll && !lastPoll && (
                <CenteredContainer>
                    <WaitingCard>
                        <WaitingIcon>⏳</WaitingIcon>
                        <h2>Aguardando o Administrador iniciar...</h2>
                        <p>Fique de olho na tela! Assim que o jogo começar, a pergunta vai aparecer aqui automaticamente.</p>
                    </WaitingCard>
                </CenteredContainer>
            )}
        </Container>
    );
};

// --- ESTILOS DO VOTANTE ---
const Container = styled.div`max-width: 800px; margin: 0 auto; padding: 1.5rem; display: flex; flex-direction: column; min-height: 100vh;`;
const Header = styled.header`display: flex; justify-content: space-between; align-items: center; padding-bottom: 1rem; border-bottom: 2px solid #e2e8f0; margin-bottom: 1.5rem;`;
const UserBadge = styled.span`background: #e2e8f0; padding: 0.5rem 1rem; border-radius: 20px; font-weight: bold; color: #334155; font-size: 0.9rem;`;
const LogoutButton = styled.button`color: #ef4444; font-weight: 600; background: none; border: none; cursor: pointer; &:hover { text-decoration: underline; }`;

const CenteredContainer = styled.div`display: flex; justify-content: center; align-items: center; flex: 1; padding: 2rem 0; min-height: 70vh;`;
const Card = styled.div`background: white; padding: 2rem; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); width: 100%; max-width: 500px;`;

// Tela de Cadastro de Apelido (Join Game)
const JoinCard = styled(Card)`max-width: 420px; text-align: center; border: 1px solid #cbd5e1;`;
const JoinHeader = styled.div`display: flex; flex-direction: column; align-items: center; gap: 0.5rem; margin-bottom: 1.5rem; h2 { font-size: 1.6rem; color: #0f172a; } p { font-size: 0.9rem; color: #64748b; line-height: 1.4; }`;
const LogoIcon = styled.div`font-size: 3rem; margin-bottom: 0.5rem;`;
const JoinForm = styled.form`display: flex; flex-direction: column; gap: 1rem;`;
const JoinInput = styled.input`padding: 0.85rem; border-radius: 8px; border: 2px solid #cbd5e1; font-size: 1rem; text-align: center; font-weight: 600; outline: none; &:focus { border-color: #2563eb; }`;
const JoinButton = styled.button`background: #2563eb; color: white; padding: 0.85rem; border-radius: 8px; font-weight: bold; font-size: 1rem; border: none; cursor: pointer; transition: background 0.2s; &:hover { background: #1d4ed8; } &:disabled { background: #94a3b8; cursor: not-allowed; }`;

const CountdownCard = styled.div`text-align: center; display: flex; flex-direction: column; align-items: center; gap: 1rem;`;
const TimerCircle = styled.div`width: 80px; height: 80px; border-radius: 50%; background: #2563eb; color: white; display: flex; align-items: center; justify-content: center; font-size: 2.5rem; font-weight: bold; box-shadow: 0 4px 10px rgba(37, 99, 235, 0.3);`;
const QuestionPreview = styled.p`font-size: 1.1rem; color: #475569; font-style: italic; margin-top: 1rem; font-weight: 500;`;

const VotingSection = styled.div`flex: 1; display: flex; align-items: center; justify-content: center;`;
const PollCard = styled(Card)`max-width: 600px;`;
const QuestionTitle = styled.h2`font-size: 1.5rem; color: #0f172a; text-align: center; margin-bottom: 1.5rem; line-height: 1.4;`;

const OptionsGrid = styled.div`display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;`;
const VoteButton = styled.button<{ voted: boolean }>`padding: 1.5rem; border-radius: 12px; font-weight: bold; font-size: 1.2rem; cursor: pointer; border: 2px solid ${props => props.voted ? '#2563eb' : '#cbd5e1'}; background: ${props => props.voted ? '#eff6ff' : 'white'}; &:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.05); } &:disabled { opacity: 0.75; transform: none; cursor: not-allowed; } transition: all 0.2s ease;`;

const OptionsList = styled.div`display: flex; flex-direction: column; gap: 0.75rem;`;
const QuizOptionButton = styled.button<{ isSelected: boolean }>`padding: 1rem; border-radius: 10px; font-weight: 600; text-align: left; font-size: 1rem; cursor: pointer; border: 2px solid ${props => props.isSelected ? '#2563eb' : '#e2e8f0'}; background: ${props => props.isSelected ? '#eff6ff' : 'white'}; &:hover { background: #f8fafc; border-color: #cbd5e1; } &:disabled { cursor: not-allowed; } transition: all 0.2s ease;`;

const SuccessMsg = styled.p`text-align: center; color: #16a34a; font-weight: bold; font-size: 0.95rem; margin-top: 1.5rem; background: #f0fdf4; padding: 0.75rem; border-radius: 8px; border: 1px solid #bbf7d0;`;

// Resultados e Ranking
const ResultsSection = styled.div`display: grid; grid-template-columns: 1.2fr 1fr; gap: 1.5rem; align-items: start; @media (max-width: 768px) { grid-template-columns: 1fr; }`;
const ResultsCard = styled(Card)`max-width: 100%;`;
const ResultHeader = styled.div`border-bottom: 2px solid #e2e8f0; padding-bottom: 1rem; margin-bottom: 1.5rem; h2 { color: #dc2626; font-size: 1.5rem; } p { color: #64748b; margin-top: 0.25rem; }`;
const VotesStats = styled.div`display: flex; flex-direction: column; gap: 0.75rem;`;
const StatBar = styled.div`background: #f1f5f9; padding: 1rem; border-radius: 8px; border-left: 4px solid #2563eb; display: flex; justify-content: space-between;`;

const GabaritoList = styled.div`display: flex; flex-direction: column; gap: 0.5rem;`;
const GabaritoItem = styled.div<{ correct: boolean }>`padding: 0.75rem; border-radius: 8px; background: ${props => props.correct ? '#f0fdf4' : '#f8fafc'}; border: 1px solid ${props => props.correct ? '#bbf7d0' : '#e2e8f0'}; color: ${props => props.correct ? '#15803d' : '#475569'}; font-weight: ${props => props.correct ? 'bold' : 'normal'};`;

const RankingCard = styled(Card)`max-width: 100%; h3 { font-size: 1.2rem; color: #1e293b; margin-bottom: 1rem; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; }`;
const RankingList = styled.div`display: flex; flex-direction: column; gap: 0.4rem;`;
const PlayerRow = styled.div<{ isMe: boolean }>`display: flex; align-items: center; padding: 0.6rem 0.75rem; border-radius: 6px; background: ${props => props.isMe ? '#eff6ff' : '#f8fafc'}; border: 1px solid ${props => props.isMe ? '#bfdbfe' : '#e2e8f0'}; font-weight: ${props => props.isMe ? 'bold' : 'normal'}; font-size: 0.95rem; .pos { width: 30px; font-weight: bold; } .name { flex: 1; } .score { font-weight: bold; color: #2563eb; }`;

// Estilo de Ranking sob mistério (Ocultado)
const SuspenseCard = styled(Card)`max-width: 100%; h3 { font-size: 1.2rem; color: #1e293b; margin-bottom: 1rem; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; } .suspense-content { display: flex; flex-direction: column; align-items: center; gap: 1rem; text-align: center; padding: 2rem 1rem; background: #faf5ff; border: 1px dashed #d8b4fe; border-radius: 8px; .icon { font-size: 2rem; } p { color: #6b21a8; font-size: 0.9rem; font-weight: 500; line-height: 1.4; } }`;

// Aguardando
const WaitingCard = styled(Card)`text-align: center; display: flex; flex-direction: column; align-items: center; gap: 1rem; max-width: 450px; h2 { font-size: 1.3rem; color: #1e293b; } p { color: #64748b; font-size: 0.9rem; line-height: 1.5; }`;
const WaitingIcon = styled.div`font-size: 3rem; animation: pulse 2s infinite ease-in-out; @keyframes pulse { 0% { transform: scale(0.9); opacity: 0.6; } 50% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(0.9); opacity: 0.6; } }`;
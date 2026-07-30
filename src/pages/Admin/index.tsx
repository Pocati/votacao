import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { db } from '../../services/firebase';
import {
    collection, addDoc, onSnapshot, updateDoc, doc,
    query, orderBy, deleteDoc, writeBatch, getDocs, setDoc
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

export const AdminDashboard: React.FC = () => {
    const navigate = useNavigate();

    // Estados de criação
    const [pollType, setPollType] = useState<'sim_nao' | 'quiz'>('sim_nao');
    const [questionInput, setQuestionInput] = useState('');
    const [options, setOptions] = useState<string[]>(['', '']);
    const [correctOption, setCorrectOption] = useState<number>(0);

    // Listas de enquetes e jogadores
    const [activePoll, setActivePoll] = useState<PollData | null>(null);
    const [preparedPolls, setPreparedPolls] = useState<PollData[]>([]);
    const [pastPolls, setPastPolls] = useState<PollData[]>([]);
    const [players, setPlayers] = useState<Player[]>([]);
    const [showRankingToUsers, setShowRankingToUsers] = useState<boolean>(true);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Escuta perguntas
        const qPolls = query(collection(db, 'polls'), orderBy('createdAt', 'asc'));
        const unsubscribePolls = onSnapshot(qPolls, (snapshot) => {
            const prepared: PollData[] = [];
            const past: PollData[] = [];
            let active: PollData | null = null;

            snapshot.docs.forEach(doc => {
                const data = { id: doc.id, ...doc.data() } as PollData;
                const currentStatus = data.status as string;

                if (currentStatus === 'ativa') {
                    active = data;
                } else if (currentStatus === 'preparada') {
                    prepared.push(data);
                } else if (currentStatus === 'encerrada') {
                    past.push(data);
                }
            });

            setActivePoll(active);
            setPreparedPolls(prepared);
            setPastPolls(past.reverse());
        });

        // Escuta ranking dos jogadores
        const qPlayers = query(collection(db, 'players'), orderBy('score', 'desc'));
        const unsubscribePlayers = onSnapshot(qPlayers, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));
            setPlayers(list);
        });

        // Escuta as configurações globais do jogo (ex: visibilidade do ranking)
        const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'game'), (docSnap) => {
            if (docSnap.exists()) {
                setShowRankingToUsers(docSnap.data().showRanking ?? true);
            } else {
                // Se não existir, inicializa no Firebase
                setDoc(doc(db, 'settings', 'game'), { showRanking: true });
            }
        });

        return () => {
            unsubscribePolls();
            unsubscribePlayers();
            unsubscribeSettings();
        };
    }, []);

    const handleAddOptionField = () => setOptions([...options, '']);
    const handleRemoveOptionField = (index: number) => {
        if (options.length <= 2) return;
        const newOptions = options.filter((_, i) => i !== index);
        setOptions(newOptions);
        if (correctOption >= newOptions.length) setCorrectOption(0);
    };

    const handleOptionChange = (index: number, value: string) => {
        const newOptions = [...options];
        newOptions[index] = value;
        setOptions(newOptions);
    };

    const handleCreatePoll = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!questionInput.trim()) return;

        setLoading(true);
        try {
            const pollPayload: any = {
                question: questionInput,
                type: pollType,
                status: 'preparada',
                createdAt: Date.now(),
            };

            if (pollType === 'sim_nao') {
                pollPayload.yesVotes = 0;
                pollPayload.noVotes = 0;
            } else {
                const filledOptions = options.filter(opt => opt.trim() !== '');
                if (filledOptions.length < 2) {
                    alert("Adicione pelo menos 2 opções de resposta!");
                    setLoading(false);
                    return;
                }
                pollPayload.options = filledOptions;
                pollPayload.correctOptionIndex = correctOption;
            }

            await addDoc(collection(db, 'polls'), pollPayload);

            setQuestionInput('');
            setOptions(['', '']);
            setCorrectOption(0);
        } catch (error) {
            console.error(error);
            alert("Erro ao salvar pergunta.");
        } finally {
            setLoading(false);
        }
    };

    const handleLaunchPoll = async (id: string | undefined) => {
        if (!id) return;
        if (activePoll) {
            alert("Já existe uma pergunta ativa ao vivo! Encerre-a primeiro.");
            return;
        }

        try {
            await updateDoc(doc(db, 'polls', id), {
                status: 'ativa',
                startedAt: Date.now()
            });
        } catch (error) {
            console.error(error);
            alert("Erro ao disparar a pergunta.");
        }
    };

    const handleEndPoll = async () => {
        if (!activePoll?.id) return;
        try {
            await updateDoc(doc(db, 'polls', activePoll.id), { status: 'encerrada' });
        } catch (error) {
            console.error(error);
        }
    };

    const handleDeletePoll = async (id: string | undefined) => {
        if (!id || !window.confirm("Deseja deletar permanentemente esta pergunta?")) return;
        await deleteDoc(doc(db, 'polls', id));
    };

    // Exclui um jogador individual do ranking
    const handleDeletePlayer = async (nickname: string) => {
        if (!window.confirm(`Deseja realmente excluir o participante "${nickname}" do placar?`)) return;
        try {
            await deleteDoc(doc(db, 'players', nickname));
        } catch (error) {
            console.error("Erro ao deletar jogador:", error);
        }
    };

    const handleResetScores = async () => {
        if (!window.confirm("Isso vai zerar os pontos de TODOS os participantes. Confirmar?")) return;
        try {
            const querySnapshot = await getDocs(collection(db, 'players'));
            const batch = writeBatch(db);
            querySnapshot.docs.forEach((playerDoc) => {
                batch.update(playerDoc.ref, { score: 0 });
            });
            await batch.commit();
        } catch (error) {
            console.error(error);
        }
    };

    // Alterna visibilidade do ranking para os usuários
    const toggleRankingVisibility = async () => {
        try {
            await updateDoc(doc(db, 'settings', 'game'), {
                showRanking: !showRankingToUsers
            });
        } catch (error) {
            console.error("Erro ao atualizar visibilidade do ranking:", error);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('user_role');
        navigate('/');
    };

    return (
        <Container>
            <Header>
                <h1>Painel do Administrador (Quiz & Polls)</h1>
                <LogoutButton onClick={handleLogout}>Sair</LogoutButton>
            </Header>

            <ThreeColumnGrid>
                {/* Coluna 1: Criador de Perguntas */}
                <SectionCard>
                    <h2>1. Criar Perguntas</h2>
                    <CardForm onSubmit={handleCreatePoll}>
                        <TypeSelector>
                            <TypeButton
                                type="button"
                                active={pollType === 'sim_nao'}
                                onClick={() => setPollType('sim_nao')}
                            >
                                🗳️ Sim/Não
                            </TypeButton>
                            <TypeButton
                                type="button"
                                active={pollType === 'quiz'}
                                onClick={() => setPollType('quiz')}
                            >
                                🎮 Quiz
                            </TypeButton>
                        </TypeSelector>

                        <Input
                            type="text"
                            placeholder="Digite a pergunta aqui..."
                            value={questionInput}
                            onChange={(e) => setQuestionInput(e.target.value)}
                            required
                        />

                        {pollType === 'quiz' && (
                            <QuizBuilder>
                                <h3>Opções de Resposta:</h3>
                                {options.map((opt, index) => (
                                    <OptionRow key={index}>
                                        <RadioInput
                                            type="radio"
                                            name="correct-option"
                                            checked={correctOption === index}
                                            onChange={() => setCorrectOption(index)}
                                        />
                                        <OptionInput
                                            type="text"
                                            placeholder={`Opção ${index + 1}`}
                                            value={opt}
                                            onChange={(e) => handleOptionChange(index, e.target.value)}
                                            required
                                        />
                                        {options.length > 2 && (
                                            <RemoveButton type="button" onClick={() => handleRemoveOptionField(index)}>✕</RemoveButton>
                                        )}
                                    </OptionRow>
                                ))}
                                <AddOptionBtn type="button" onClick={handleAddOptionField}>
                                    + Adicionar Opção
                                </AddOptionBtn>
                                <HelpText>Selecione a resposta correta usando o botão de rádio.</HelpText>
                            </QuizBuilder>
                        )}

                        <Button type="submit" disabled={loading}>
                            {loading ? 'Salvando...' : 'Salvar no Banco'}
                        </Button>
                    </CardForm>
                </SectionCard>

                {/* Coluna 2: Controle de Rodadas e Perguntas Preparadas */}
                <SectionCard>
                    <h2>2. Controle de Rodadas</h2>

                    {/* PAINEL AO VIVO */}
                    <LivePanel>
                        <h3>PAINEL AO VIVO</h3>
                        {activePoll ? (
                            <ActiveCard>
                                <StatusBadge>Ao Vivo</StatusBadge>
                                <QuestionText>"{activePoll.question}"</QuestionText>
                                <p style={{ fontSize: '0.85rem', color: '#475569' }}>Tipo: <strong>{activePoll.type === 'quiz' ? '🎮 Quiz' : '🗳️ Sim/Não'}</strong></p>
                                <EndButton type="button" onClick={handleEndPoll}>
                                    Encerrar Rodada e Mostrar Ranking
                                </EndButton>
                            </ActiveCard>
                        ) : (
                            <NoActiveMessage>Nenhuma pergunta ativa no momento. Dispare uma abaixo!</NoActiveMessage>
                        )}
                    </LivePanel>

                    {/* FILA DE PREPARADAS */}
                    <PreparedListSection>
                        <h3>Perguntas Preparadas ({preparedPolls.length})</h3>
                        {preparedPolls.length === 0 ? (
                            <EmptyMessage>Não há perguntas preparadas. Crie-as na coluna ao lado.</EmptyMessage>
                        ) : (
                            preparedPolls.map((poll) => (
                                <PreparedCard key={poll.id}>
                                    <PreparedInfo>
                                        <h4>"{poll.question}"</h4>
                                        <p>{poll.type === 'quiz' ? '🎮 Quiz' : '🗳️ Sim/Não'}</p>
                                    </PreparedInfo>
                                    <ActionGroup>
                                        <LaunchButton onClick={() => handleLaunchPoll(poll.id)} disabled={!!activePoll}>
                                            🚀 Disparar
                                        </LaunchButton>
                                        <DeleteIconButton onClick={() => handleDeletePoll(poll.id)}>🗑️</DeleteIconButton>
                                    </ActionGroup>
                                </PreparedCard>
                            ))
                        )}
                    </PreparedListSection>
                </SectionCard>

                {/* Coluna 3: Placar Geral e Histórico */}
                <SectionCard>
                    <h2>3. Resultados & Ranking</h2>

                    <RankingWrapper>
                        <RankingHeader>
                            <h3>Placar Geral</h3>
                            <ResetPointsBtn onClick={handleResetScores}>Resetar Placar</ResetPointsBtn>
                        </RankingHeader>

                        {/* BOTÃO MOSTRAR/ESCONDER RANKING PROS USUÁRIOS */}
                        <VisibilityButton onClick={toggleRankingVisibility} $active={showRankingToUsers}>
                            {showRankingToUsers ? '👁️ Ranking Visível' : '🙈 Ranking Não-Visível'}
                        </VisibilityButton>
                        <RankingList>
                            {players.length === 0 ? (
                                <EmptyMessage>Nenhum participante conectado.</EmptyMessage>
                            ) : (
                                players.map((player, index) => (
                                    <PlayerRow key={player.id} position={index + 1}>
                                        <span className="pos">#{index + 1}</span>
                                        <span className="name">{player.nickname}</span>
                                        <span className="score">{player.score} pts</span>
                                        {/* Botão de excluir usuário do banco */}
                                        <DeleteIconButton
                                            onClick={() => handleDeletePlayer(player.nickname)}
                                            style={{ padding: '0.1rem 0.3rem', fontSize: '0.85rem', marginLeft: '0.5rem' }}
                                            title="Excluir do Placar"
                                        >
                                            🗑️
                                        </DeleteIconButton>
                                    </PlayerRow>
                                ))
                            )}
                        </RankingList>
                    </RankingWrapper>

                    <HistoryWrapper>
                        <h3>Histórico de Encerradas</h3>
                        {pastPolls.length === 0 ? (
                            <EmptyMessage>Nenhuma rodada encerrada ainda.</EmptyMessage>
                        ) : (
                            pastPolls.map(poll => (
                                <HistoryCard key={poll.id}>
                                    <HistoryHeader>
                                        <div>
                                            <h5>"{poll.question}"</h5>
                                            <span className="tag">{poll.type === 'quiz' ? 'Quiz' : 'Sim/Não'}</span>
                                        </div>
                                        <DeleteIconButton onClick={() => handleDeletePoll(poll.id)}>🗑️</DeleteIconButton>
                                    </HistoryHeader>
                                </HistoryCard>
                            ))
                        )}
                    </HistoryWrapper>
                </SectionCard>
            </ThreeColumnGrid>
        </Container>
    );
};

// --- ESTILIZAÇÃO DO LAYOUT EM 3 COLUNAS ---
const Container = styled.div`max-width: 1400px; margin: 0 auto; padding: 1.5rem;`;
const Header = styled.header`display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 1rem; h1 { font-size: 1.8rem; color: #0f172a; }`;
const LogoutButton = styled.button`color: #ef4444; font-weight: 600; background: none; border: none; cursor: pointer; &:hover { text-decoration: underline; }`;
const ThreeColumnGrid = styled.div`display: grid; grid-template-columns: 1.1fr 1.3fr 1fr; gap: 1.5rem; align-items: start; @media (max-width: 1024px) { grid-template-columns: 1fr; }`;
const SectionCard = styled.div`background: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #f1f5f9; padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; h2 { font-size: 1.3rem; color: #1e293b; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; }`;
const CardForm = styled.form`display: flex; flex-direction: column; gap: 1rem;`;
const TypeSelector = styled.div`display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;`;
const TypeButton = styled.button<{ active: boolean }>`padding: 0.75rem; border-radius: 8px; border: 2px solid ${props => props.active ? '#2563eb' : '#e2e8f0'}; background: ${props => props.active ? '#eff6ff' : 'white'}; color: ${props => props.active ? '#2563eb' : '#475569'}; font-weight: bold; font-size: 0.9rem; cursor: pointer;`;
const Input = styled.input`padding: 0.75rem; border-radius: 8px; border: 2px solid #cbd5e1; font-size: 1rem; outline: none; &:focus { border-color: #2563eb; }`;
const Button = styled.button`background: #2563eb; color: white; padding: 0.75rem; border-radius: 8px; font-weight: bold; font-size: 1rem; cursor: pointer; border: none; &:hover { background: #1d4ed8; } &:disabled { background: #94a3b8; cursor: not-allowed; }`;
const EndButton = styled(Button)`background: #dc2626; margin-top: 0.5rem; &:hover { background: #b91c1c; }`;
const StatusBadge = styled.span`align-self: flex-start; background: #fee2e2; color: #dc2626; padding: 0.2rem 0.6rem; border-radius: 4px; font-weight: bold; font-size: 0.75rem; text-transform: uppercase;`;
const QuestionText = styled.h3`font-size: 1.2rem; color: #1e293b; line-height: 1.4;`;
const QuizBuilder = styled.div`display: flex; flex-direction: column; gap: 0.75rem; border-top: 1px solid #e2e8f0; padding-top: 0.75rem; h3 { font-size: 0.95rem; color: #475569; }`;
const OptionRow = styled.div`display: flex; align-items: center; gap: 0.5rem;`;
const RadioInput = styled.input`transform: scale(1.1); cursor: pointer;`;
const OptionInput = styled.input`flex: 1; padding: 0.5rem 0.75rem; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 0.9rem;`;
const RemoveButton = styled.button`color: #ef4444; font-weight: bold; padding: 0.25rem; background: none; border: none; cursor: pointer;`;
const AddOptionBtn = styled.button`align-self: flex-start; color: #2563eb; font-weight: bold; font-size: 0.85rem; background: none; border: none; cursor: pointer; &:hover { text-decoration: underline; }`;
const HelpText = styled.p`font-size: 0.75rem; color: #64748b;`;

// Configuração do botão de Visibilidade do ranking
const VisibilityButton = styled.button<{ $active: boolean }>`
  background: ${props => props.$active ? '#22c55e' : '#f59e0b'};
  color: white;
  border: none;
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  font-weight: bold;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.2s;
  
  &:hover { 
    opacity: 0.9; 
  }
`;
// Rodadas e Ao Vivo
const LivePanel = styled.div`background: #f8fafc; border: 2px dashed #e2e8f0; border-radius: 8px; padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem; h3 { font-size: 0.9rem; color: #475569; font-weight: bold; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.25rem; }`;
const ActiveCard = styled.div`display: flex; flex-direction: column; gap: 0.75rem; margin-top: 0.5rem;`;
const NoActiveMessage = styled.p`color: #94a3b8; font-style: italic; text-align: center; padding: 1rem 0; font-size: 0.9rem;`;
const PreparedListSection = styled.div`display: flex; flex-direction: column; gap: 0.75rem; h3 { font-size: 1rem; color: #334155; }`;
const PreparedCard = styled.div`background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.75rem 1rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem;`;
const PreparedInfo = styled.div`flex: 1; h4 { font-size: 0.95rem; color: #1e293b; } p { font-size: 0.8rem; color: #64748b; margin-top: 0.2rem; }`;
const ActionGroup = styled.div`display: flex; align-items: center; gap: 0.5rem;`;
const LaunchButton = styled.button`background: #22c55e; color: white; font-weight: bold; padding: 0.4rem 0.8rem; border-radius: 6px; font-size: 0.85rem; border: none; cursor: pointer; &:hover { background: #16a34a; } &:disabled { background: #cbd5e1; cursor: not-allowed; }`;
const DeleteIconButton = styled.button`color: #ef4444; padding: 0.25rem; border-radius: 4px; font-size: 1rem; background: none; border: none; cursor: pointer; &:hover { background: #fef2f2; }`;

// Resultados
const RankingWrapper = styled.div`display: flex; flex-direction: column; gap: 0.75rem; h3 { font-size: 1rem; color: #334155; }`;
const RankingHeader = styled.div`display: flex; justify-content: space-between; align-items: center;`;
const ResetPointsBtn = styled.button`color: #f59e0b; font-weight: bold; font-size: 0.8rem; background: none; border: none; cursor: pointer; &:hover { text-decoration: underline; }`;
const RankingList = styled.div`display: flex; flex-direction: column; gap: 0.4rem;`;
const PlayerRow = styled.div<{ position: number }>`display: flex; align-items: center; padding: 0.5rem 0.75rem; border-radius: 6px; background: ${props => props.position === 1 ? '#fef3c7' : props.position === 2 ? '#f1f5f9' : props.position === 3 ? '#ffedd5' : '#f8fafc'}; border: 1px solid ${props => props.position === 1 ? '#f59e0b' : '#e2e8f0'}; font-size: 0.9rem; .pos { width: 30px; font-weight: bold; } .name { flex: 1; } .score { font-weight: bold; color: #2563eb; }`;
const HistoryWrapper = styled.div`display: flex; flex-direction: column; gap: 0.75rem; border-top: 1px solid #f1f5f9; padding-top: 1rem; h3 { font-size: 1rem; color: #334155; }`;
const HistoryCard = styled.div`background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.5rem 0.75rem; display: flex; justify-content: space-between; align-items: center; h5 { font-size: 0.85rem; color: #334155; } .tag { font-size: 0.7rem; background: #e2e8f0; padding: 0.1rem 0.4rem; border-radius: 4px; color: #475569; }`;
const HistoryHeader = styled.div`display: flex; justify-content: space-between; align-items: center; width: 100%;`;
const EmptyMessage = styled.p`color: #94a3b8; font-style: italic; font-size: 0.85rem; text-align: center;`;
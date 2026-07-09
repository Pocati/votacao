// src/pages/Voter/index.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { db } from '../../services/firebase';
import { collection, onSnapshot, runTransaction, doc, query, orderBy, limit } from 'firebase/firestore';

interface PollData {
    id?: string;
    question: string;
    status: 'ativa' | 'encerrada';
    yesVotes: number;
    noVotes: number;
    createdAt: number;
}

export const VotingArea: React.FC = () => {
    const navigate = useNavigate();
    const [activePoll, setActivePoll] = useState<PollData | null>(null);
    const [votingLoading, setVotingLoading] = useState(false);
    const [currentPollId, setCurrentPollId] = useState<string | null>(null);

    useEffect(() => {
        // Escuta apenas a enquete mais recente criada
        const q = query(collection(db, 'polls'), orderBy('createdAt', 'desc'), limit(1));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const latestDoc = snapshot.docs[0];
                const data = { id: latestDoc.id, ...latestDoc.data() } as PollData;

                // Se mudou o ID da enquete, significa que uma nova foi criada. Reseta o voto local.
                if (data.id !== currentPollId) {
                    setCurrentPollId(data.id || null);
                    setHasVotedState(false);
                }

                // Só exibe na tela do usuário se ela estiver com status ativo
                if (data.status === 'ativa') {
                    setActivePoll(data);
                } else {
                    setActivePoll(null);
                }
            } else {
                setActivePoll(null);
            }
        });

        return () => unsubscribe();
    }, [currentPollId]);

    // Controle do estado de voto baseado na enquete atual
    const [hasVoted, setHasVotedState] = useState(false);

    const handleVote = async (option: 'yes' | 'no') => {
        if (hasVoted || votingLoading || !activePoll?.id) return;

        setVotingLoading(true);
        try {
            const pollRef = doc(db, 'polls', activePoll.id);

            await runTransaction(db, async (transaction) => {
                const pollSnapshot = await transaction.get(pollRef);
                const currentData = pollSnapshot.data() as PollData;

                if (currentData.status !== 'ativa') {
                    throw "Esta votação já foi encerrada.";
                }

                if (option === 'yes') {
                    transaction.update(pollRef, { yesVotes: currentData.yesVotes + 1 });
                } else {
                    transaction.update(pollRef, { noVotes: currentData.noVotes + 1 });
                }
            });

            setHasVotedState(true);
        } catch (error) {
            console.error(error);
            alert("Erro ao computar voto.");
        } finally {
            setVotingLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('user_role');
        navigate('/');
    };

    return (
        <Container>
            <Header>
                <h1>Portal de Votação</h1>
                <LogoutButton onClick={handleLogout}>Sair</LogoutButton>
            </Header>

            <MainContent>
                {activePoll ? (
                    /* Se houver enquete ativa, mostra para votação */
                    <Card>
                        <Badge>Ao Vivo</Badge>
                        <QuestionText>"{activePoll.question}"</QuestionText>

                        {!hasVoted ? (
                            <VoteButtonsContainer>
                                <VoteButton type="yes" onClick={() => handleVote('yes')} disabled={votingLoading}>
                                    👍 Sim / A Favor
                                </VoteButton>
                                <VoteButton type="no" onClick={() => handleVote('no')} disabled={votingLoading}>
                                    👎 Não / Contra
                                </VoteButton>
                            </VoteButtonsContainer>
                        ) : (
                            <VotedFeedback>
                                <CheckIcon>✓</CheckIcon>
                                <h3>Voto Computado!</h3>
                                <p>Aguarde o encerramento ou a próxima pergunta formulada pelo administrador.</p>
                            </VotedFeedback>
                        )}
                    </Card>
                ) : (
                    /* Se NÃO houver nenhuma enquete ativa, cai sempre na tela de espera limpa */
                    <Card style={{ textAlign: 'center', color: '#64748b', padding: '3rem 2rem' }}>
                        <WaitingIcon>⏳</WaitingIcon>
                        <h2 style={{ color: '#1e293b', marginTop: '1rem' }}>Nenhuma votação aberta</h2>
                        <p style={{ marginTop: '0.5rem' }}>Aguardando o administrador lançar a próxima pergunta...</p>
                    </Card>
                )}
            </MainContent>
        </Container>
    );
};

// --- STYLED COMPONENTS ---
const Container = styled.div`max-width: 600px; margin: 0 auto; padding: 2rem;`;
const Header = styled.header`display: flex; justify-content: space-between; align-items: center; margin-bottom: 3rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 1rem;`;
const LogoutButton = styled.button`color: #64748b; font-weight: 600; &:hover { color: #1e293b; text-decoration: underline; }`;
const MainContent = styled.main`display: flex; flex-direction: column;`;
const Card = styled.div`background: white; padding: 2.5rem 2rem; border-radius: 16px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05); display: flex; flex-direction: column; gap: 1.5rem;`;
const Badge = styled.span`align-self: flex-start; background: #ef4444; color: white; padding: 0.25rem 0.75rem; border-radius: 6px; font-weight: bold; font-size: 0.75rem; text-transform: uppercase;`;
const QuestionText = styled.h2`font-size: 1.75rem; color: #0f172a; line-height: 1.4;`;
const VoteButtonsContainer = styled.div`display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem;`;
const VoteButton = styled.button<{ type: 'yes' | 'no' }>`background: ${props => props.type === 'yes' ? '#22c55e' : '#ef4444'}; color: white; padding: 1.25rem; border-radius: 12px; font-weight: bold; font-size: 1.1rem; &:hover { filter: brightness(0.9); }`;
const VotedFeedback = styled.div`text-align: center; padding: 2rem; background: #f8fafc; border-radius: 12px; h3 { color: #16a34a; }`;
const CheckIcon = styled.div`font-size: 2.5rem; color: #22c55e;`;
const WaitingIcon = styled.div`font-size: 3rem; animation: pulse 2s infinite; @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`;
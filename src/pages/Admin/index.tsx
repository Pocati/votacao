// src/pages/Admin/index.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { db } from '../../services/firebase';
import { collection, addDoc, onSnapshot, updateDoc, doc, query, orderBy, deleteDoc } from 'firebase/firestore';

interface PollData {
    id?: string;
    question: string;
    status: 'ativa' | 'encerrada';
    yesVotes: number;
    noVotes: number;
    createdAt: number;
}

export const AdminDashboard: React.FC = () => {
    const navigate = useNavigate();
    const [questionInput, setQuestionInput] = useState('');
    const [activePoll, setActivePoll] = useState<PollData | null>(null);
    const [pastPolls, setPastPolls] = useState<PollData[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const q = query(collection(db, 'polls'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const pollsList: PollData[] = [];
            let currentActive: PollData | null = null;

            snapshot.docs.forEach(doc => {
                const data = { id: doc.id, ...doc.data() } as PollData;
                if (data.status === 'ativa') {
                    currentActive = data;
                } else {
                    pollsList.push(data);
                }
            });

            setActivePoll(currentActive);
            setPastPolls(pollsList);
        });

        return () => unsubscribe();
    }, []);

    const handleCreatePoll = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!questionInput.trim() || activePoll) return;

        setLoading(true);
        try {
            await addDoc(collection(db, 'polls'), {
                question: questionInput,
                status: 'ativa',
                yesVotes: 0,
                noVotes: 0,
                createdAt: Date.now()
            });
            setQuestionInput('');
        } catch (error) {
            console.error("Erro ao criar enquete:", error);
            alert("Erro ao lançar a pergunta.");
        } finally {
            setLoading(false);
        }
    };

    const handleEndPoll = async () => {
        if (!activePoll?.id) return;
        try {
            const pollDocRef = doc(db, 'polls', activePoll.id);
            await updateDoc(pollDocRef, {
                status: 'encerrada'
            });
        } catch (error) {
            console.error("Erro ao encerrar enquete:", error);
        }
    };

    // Função para deletar de vez o documento do banco de dados
    const handleDeletePoll = async (id: string | undefined) => {
        if (!id) return;
        const confirmDelete = window.confirm("Tem certeza que deseja deletar este resultado permanentemente?");
        if (!confirmDelete) return;

        try {
            await deleteDoc(doc(db, 'polls', id));
        } catch (error) {
            console.error("Erro ao deletar documento:", error);
            alert("Não foi possível deletar o resultado.");
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('user_role');
        navigate('/');
    };

    return (
        <Container>
            <Header>
                <h1>Painel do Administrador</h1>
                <LogoutButton onClick={handleLogout}>Sair</LogoutButton>
            </Header>

            <MainContent>
                {!activePoll ? (
                    <Card onSubmit={handleCreatePoll}>
                        <h2>Lançar Nova Pergunta</h2>
                        <Input
                            type="text"
                            placeholder="Ex: Você é a favor do Home Office integral?"
                            value={questionInput}
                            onChange={(e) => setQuestionInput(e.target.value)}
                            disabled={loading}
                        />
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Lançando...' : 'Lançar Pergunta em Tempo Real'}
                        </Button>
                    </Card>
                ) : (
                    <Card>
                        <StatusBadge>Votação Ao Vivo</StatusBadge>
                        <QuestionText>"{activePoll.question}"</QuestionText>

                        <ResultsContainer>
                            <ResultBox type="yes">
                                <span>Sim 👍</span>
                                <strong>{activePoll.yesVotes}</strong>
                            </ResultBox>
                            <ResultBox type="no">
                                <span>Não 👎</span>
                                <strong>{activePoll.noVotes}</strong>
                            </ResultBox>
                        </ResultsContainer>

                        <EndButton type="button" onClick={handleEndPoll}>
                            Encerrar Votação e Resetar Painel
                        </EndButton>
                    </Card>
                )}

                <HistorySection>
                    <h2>Histórico de Resultados</h2>
                    {pastPolls.length === 0 ? (
                        <EmptyMessage>Nenhuma enquete encerrada ainda.</EmptyMessage>
                    ) : (
                        pastPolls.map((poll) => {
                            const total = poll.yesVotes + poll.noVotes;
                            const yesPercent = total > 0 ? Math.round((poll.yesVotes / total) * 100) : 0;
                            const noPercent = total > 0 ? Math.round((poll.noVotes / total) * 100) : 0;

                            return (
                                <HistoryCard key={poll.id}>
                                    <HistoryHeader>
                                        <h3>"{poll.question}"</h3>
                                        <DeleteButton onClick={() => handleDeletePoll(poll.id)} title="Deletar resultado">
                                            🗑️ Deletar
                                        </DeleteButton>
                                    </HistoryHeader>
                                    <HistoryGrid>
                                        <HistoryResult type="yes">
                                            Sim: <strong>{poll.yesVotes}</strong> ({yesPercent}%)
                                        </HistoryResult>
                                        <HistoryResult type="no">
                                            Não: <strong>{poll.noVotes}</strong> ({noPercent}%)
                                        </HistoryResult>
                                    </HistoryGrid>
                                    <TotalText>Total de votos: {total}</TotalText>
                                </HistoryCard>
                            );
                        })
                    )}
                </HistorySection>
            </MainContent>
        </Container>
    );
};

// --- STYLED COMPONENTS ---
const Container = styled.div`max-width: 800px; margin: 0 auto; padding: 2rem;`;
const Header = styled.header`display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 1rem;`;
const LogoutButton = styled.button`color: #ef4444; font-weight: 600; &:hover { text-decoration: underline; }`;
const MainContent = styled.div`display: flex; flex-direction: column; gap: 2.5rem;`;
const Card = styled.form`background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); display: flex; flex-direction: column; gap: 1.5rem;`;
const Input = styled.input`padding: 1rem; border-radius: 8px; border: 2px solid #cbd5e1; font-size: 1.1rem; outline: none; &:focus { border-color: #2563eb; }`;
const Button = styled.button`background: #2563eb; color: white; padding: 1rem; border-radius: 8px; font-weight: bold; font-size: 1.1rem; &:hover { background: #1d4ed8; } &:disabled { background: #94a3b8; }`;
const EndButton = styled(Button)`background: #dc2626; &:hover { background: #b91c1c; }`;
const StatusBadge = styled.span`align-self: flex-start; background: #dcfce7; color: #15803d; padding: 0.25rem 0.75rem; border-radius: 9999px; font-weight: bold; font-size: 0.875rem; text-transform: uppercase;`;
const QuestionText = styled.h3`font-size: 1.5rem; color: #1e293b;`;
const ResultsContainer = styled.div`display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;`;
const ResultBox = styled.div<{ type: 'yes' | 'no' }>`background: ${props => props.type === 'yes' ? '#f0fdf4' : '#fef2f2'}; border: 2px solid ${props => props.type === 'yes' ? '#bbf7d0' : '#fecaca'}; padding: 1.5rem; border-radius: 8px; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; span { font-size: 1.1rem; color: #475569; } strong { font-size: 2.5rem; color: ${props => props.type === 'yes' ? '#16a34a' : '#dc2626'}; }`;
const HistorySection = styled.section`display: flex; flex-direction: column; gap: 1rem; h2 { color: #334155; font-size: 1.5rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem; }`;
const EmptyMessage = styled.p`color: #94a3b8; font-style: italic;`;

const HistoryCard = styled.div`
  background: #fff;
  border-left: 4px solid #94a3b8;
  padding: 1.5rem;
  border-radius: 0 8px 8px 0;
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const HistoryHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  h3 { font-size: 1.1rem; color: #1e293b; flex: 1; }
`;

const DeleteButton = styled.button`
  color: #ef4444;
  font-size: 0.875rem;
  font-weight: 600;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  transition: background 0.2s;
  &:hover {
    background: #fef2f2;
  }
`;

const HistoryGrid = styled.div`display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;`;
const HistoryResult = styled.div<{ type: 'yes' | 'no' }>`background: #f8fafc; padding: 0.5rem 1rem; border-radius: 6px; color: #475569; strong { color: ${props => props.type === 'yes' ? '#16a34a' : '#dc2626'}; }`;
const TotalText = styled.span`font-size: 0.85rem; color: #94a3b8; font-weight: 500;`;
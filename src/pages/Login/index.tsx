import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';

export const Login: React.FC = () => {
    const [role, setRole] = useState<'admin' | 'voter'>('voter');
    const navigate = useNavigate();

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        // Simulação temporária de login salvando a role no localStorage
        localStorage.setItem('user_role', role);

        if (role === 'admin') {
            navigate('/admin');
        } else {
            navigate('/voting');
        }
    };

    return (
        <Container>
            <Card onSubmit={handleLogin}>
                <h2>Acessar Sistema de Votação</h2>
                <Select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'voter')}>
                    <option value="voter">Entrar como Votante (Público)</option>
                    <option value="admin">Entrar como Administrador</option>
                </Select>
                <Button type="submit">Entrar</Button>
            </Card>
        </Container>
    );
};

const Container = styled.div`
  display: flex;
  height: 100vh;
  justify-content: center;
  align-items: center;
`;

const Card = styled.form`
  background: white;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;
  max-width: 400px;
`;

const Select = styled.select`
  padding: 0.75rem;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  font-size: 1rem;
`;

const Button = styled.button`
  background: #2563eb;
  color: white;
  padding: 0.75rem;
  border-radius: 6px;
  font-weight: bold;
  &:hover { background: #1d4ed8; }
`;
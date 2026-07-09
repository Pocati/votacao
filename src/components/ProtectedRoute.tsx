import React from 'react';
import { Navigate } from 'react-router-dom';

interface ProtectedRouteProps {
    children: React.ReactElement;
    allowedRole: 'admin' | 'voter';
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRole }) => {
    const userRole = localStorage.getItem('user_role');
    if (!userRole) {
        return <Navigate to="/" replace />;
    }
    if (userRole !== allowedRole) {
        return <Navigate to={userRole === 'admin' ? '/admin' : '/voting'} replace />;
    }

    return children;
};
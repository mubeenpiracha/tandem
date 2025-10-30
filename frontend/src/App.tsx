import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './components/Auth/AuthContext';
import { WorkspaceProvider } from './components/Auth/WorkspaceContext';
import { RealTimeProvider } from './hooks/useRealTimeUpdates';
import Dashboard from './pages/Dashboard';
import AuthPage from './pages/AuthPage';
import Preferences from './pages/Preferences';
import WorkspaceSettings from './pages/WorkspaceSettings';
import ProtectedRoute from './components/Auth/ProtectedRoute';
import Navigation from './components/Navigation';
import HomePage from './components/HomePage';
import './App.css';

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <main>{children}</main>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <WorkspaceProvider>
          <RealTimeProvider>
            <div className="App">
              <Routes>
                {/* Auth routes (no navigation) */}
                <Route path="/auth" element={<AuthPage />} />
                
                {/* Protected routes with navigation */}
                <Route 
                  path="/dashboard" 
                  element={
                    <ProtectedRoute>
                      <AppLayout>
                        <Dashboard />
                      </AppLayout>
                    </ProtectedRoute>
                  } 
                />
                
                <Route 
                  path="/preferences" 
                  element={
                    <ProtectedRoute>
                      <AppLayout>
                        <Preferences />
                      </AppLayout>
                    </ProtectedRoute>
                  } 
                />
                
                <Route 
                  path="/workspace/:workspaceId/settings" 
                  element={
                    <ProtectedRoute>
                      <AppLayout>
                        <WorkspaceSettings />
                      </AppLayout>
                    </ProtectedRoute>
                  } 
                />
                
                {/* Home route - handles auth-aware redirect */}
                <Route path="/" element={<HomePage />} />
                
                {/* Catch all - redirect to home */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </RealTimeProvider>
        </WorkspaceProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;

import { Route, Routes } from 'react-router-dom';
import { LoginPage } from './features/auth/LoginPage';
import { RequireAuth } from './features/auth/RequireAuth';

function Home() {
  return <p>Cursos</p>;
}

export default function App() {
  return (
    <>
      <h1>LingoLeap</h1>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Home />
            </RequireAuth>
          }
        />
      </Routes>
    </>
  );
}

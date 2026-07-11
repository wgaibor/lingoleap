import { Route, Routes } from 'react-router-dom';

function Home() {
  return <p>Bienvenido a LingoLeap.</p>;
}

export default function App() {
  return (
    <>
      <h1>LingoLeap</h1>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </>
  );
}

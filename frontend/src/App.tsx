import { BrowserRouter, Routes, Route } from "react-router";
import { FlagList } from "./pages/FlagList";
import { FlagDetail } from "./pages/FlagDetail";
import "./App.css";

const base = (window as any).__BASE_PATH__ || '';

export default function App() {
  return (
    <BrowserRouter basename={base}>
      <div className="app">
        <header className="app-header">
          <a href={base || "/"} className="app-logo">flagd-ui</a>
          <span className="app-subtitle">read-only</span>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<FlagList />} />
            <Route path="/flags/:key" element={<FlagDetail />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

import { BrowserRouter, Routes, Route } from "react-router";
import { FlagList } from "./pages/FlagList";
import { FlagDetail } from "./pages/FlagDetail";
import "./App.css";

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <header className="app-header">
          <a href="/" className="app-logo">flagd-ui</a>
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

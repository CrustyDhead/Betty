import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { initStore } from "./lib/store";
import { useCurrentUser, useStoreState } from "./lib/useStore";
import { NavBar } from "./components/NavBar";
import { Login } from "./pages/Login";
import { Feed } from "./pages/Feed";
import { BetDetail } from "./pages/BetDetail";
import { CreateBet } from "./pages/CreateBet";
import { MyBets } from "./pages/MyBets";
import { Leaderboard } from "./pages/Leaderboard";
import { Profile } from "./pages/Profile";
import { Casino } from "./pages/Casino";
import { Roulette } from "./pages/Roulette";
import { Slots } from "./pages/Slots";
import { Blackjack } from "./pages/Blackjack";

export default function App() {
  const state = useStoreState();
  const user = useCurrentUser();

  useEffect(() => {
    initStore();
  }, []);

  if (state.error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="max-w-sm text-center text-sm text-(--color-no-text)">
          Couldn't reach the backend: {state.error}
        </p>
      </div>
    );
  }

  if (state.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="font-display text-sm text-(--color-ink-soft)">Loading…</p>
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <BrowserRouter>
      <NavBar />
      <Routes>
        <Route path="/" element={<Feed />} />
        <Route path="/bets/:id" element={<BetDetail />} />
        <Route path="/create" element={<CreateBet />} />
        <Route path="/my-bets" element={<MyBets />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/casino" element={<Casino />} />
        <Route path="/casino/roulette" element={<Roulette />} />
        <Route path="/casino/slots" element={<Slots />} />
        <Route path="/casino/blackjack" element={<Blackjack />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/profile/:userId" element={<Profile />} />
      </Routes>
    </BrowserRouter>
  );
}

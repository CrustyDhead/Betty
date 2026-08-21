import { BrowserRouter, Route, Routes } from "react-router-dom";
import { useCurrentUser } from "./lib/useStore";
import { NavBar } from "./components/NavBar";
import { Login } from "./pages/Login";
import { Feed } from "./pages/Feed";
import { BetDetail } from "./pages/BetDetail";
import { CreateBet } from "./pages/CreateBet";
import { MyBets } from "./pages/MyBets";
import { Leaderboard } from "./pages/Leaderboard";
import { Profile } from "./pages/Profile";

export default function App() {
  const user = useCurrentUser();

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
        <Route path="/profile" element={<Profile />} />
      </Routes>
    </BrowserRouter>
  );
}

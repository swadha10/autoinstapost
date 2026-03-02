import { createContext, useContext, useEffect, useState } from "react";
import { getMe } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("aip_token");
    if (!token) {
      setIsLoading(false);
      return;
    }
    getMe()
      .then((u) => setUser(u))
      .catch(() => localStorage.removeItem("aip_token"))
      .finally(() => setIsLoading(false));
  }, []);

  function login(token) {
    localStorage.setItem("aip_token", token);
    return getMe().then((u) => setUser(u));
  }

  function logout() {
    localStorage.removeItem("aip_token");
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAuthenticated: !!user, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

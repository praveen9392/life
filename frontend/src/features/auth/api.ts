import { httpClient } from "../../services/api/httpClient";
import type { User } from "../../types/user";

export interface RegisterInput {
  email: string;
  password: string;
  full_name?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export const authApi = {
  register: (input: RegisterInput) =>
    httpClient.post<{ user: User }>("/api/v1/auth/register", input),
  login: (input: LoginInput) => httpClient.post<{ user: User }>("/api/v1/auth/login", input),
  logout: () => httpClient.post<{ message: string }>("/api/v1/auth/logout"),
  logoutAll: () => httpClient.post<{ message: string }>("/api/v1/auth/logout-all"),
  me: () => httpClient.get<User>("/api/v1/users/me"),
};

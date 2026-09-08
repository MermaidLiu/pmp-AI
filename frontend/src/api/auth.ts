import { api } from "./client";
import type { AuthUser } from "../lib/authSession";

export type AuthResponse = { token: string; user: AuthUser };

export async function authGetQuota() {
  const { data } = await api.get<AuthUser>("/api/v1/auth/quota");
  return data;
}

export async function authRegister(email: string, password: string, display_name = "") {
  const { data } = await api.post<AuthResponse>("/api/v1/auth/register", {
    email,
    password,
    display_name,
  });
  return data;
}

export async function authLogin(email: string, password: string) {
  const { data } = await api.post<AuthResponse>("/api/v1/auth/login", { email, password });
  return data;
}

export async function authMe() {
  const { data } = await api.get<AuthUser>("/api/v1/auth/me");
  return data;
}

export async function authCheckoutPro() {
  const { data } = await api.post<{
    order_id: string;
    amount_usd: number;
    currency: string;
    plan: string;
    status: string;
    merchant_name: string;
    qr_payload: string;
    qr_image_url: string;
    note: string;
    duration_days: number;
  }>("/api/v1/auth/billing/checkout", { plan: "pro" });
  return data;
}

export async function authConfirmMockPayment(order_id: string) {
  const { data } = await api.post<{
    ok: boolean;
    order_id: string;
    status: string;
    user: AuthUser;
    message: string;
  }>("/api/v1/auth/billing/confirm-mock", { order_id });
  return data;
}

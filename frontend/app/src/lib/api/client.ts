import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
  AxiosHeaders,
} from "axios";

import { ensureCsrfToken } from "./csrf";

const UNSAFE_METHODS = new Set(["post", "put", "patch", "delete"]);

export const apiClient: AxiosInstance = axios.create({
  baseURL: "/api/v3",
  withCredentials: true,
  headers: {
    Accept: "application/json",
  },
});

apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const method = (config.method ?? "get").toLowerCase();
  if (UNSAFE_METHODS.has(method)) {
    const token = await ensureCsrfToken();
    if (token) {
      const headers = AxiosHeaders.from(config.headers);
      headers.set("X-CSRFToken", token);
      config.headers = headers;
    }
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.assign(`/login-bridge?next=${next}`);
    }
    return Promise.reject(error);
  },
);

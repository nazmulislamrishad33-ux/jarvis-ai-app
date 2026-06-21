import AsyncStorage from "@react-native-async-storage/async-storage";

const SERVER_URL_KEY = "jarvis_server_url";

export async function getServerUrl(): Promise<string> {
  const stored = await AsyncStorage.getItem(SERVER_URL_KEY);
  if (stored) return stored.replace(/\/$/, "");

  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}`;

  return "";
}

export async function saveServerUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(SERVER_URL_KEY, url.replace(/\/$/, ""));
}

export async function getApiBase(): Promise<string> {
  const base = await getServerUrl();
  if (!base) return "/api";
  return `${base}/api`;
}

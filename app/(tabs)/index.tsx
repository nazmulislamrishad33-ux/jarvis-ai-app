import React from "react";
import { useJarvis } from "@/contexts/JarvisContext";
import { ActivationScreen } from "@/components/ActivationScreen";
import { ChatScreen } from "@/components/ChatScreen";

export default function MainScreen() {
  const { isActivated } = useJarvis();
  return isActivated ? <ChatScreen /> : <ActivationScreen />;
}

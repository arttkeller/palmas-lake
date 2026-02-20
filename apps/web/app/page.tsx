import { Suspense } from "react";
import AnimatedLoginPage from "@/components/ui/animated-characters-login-page";

export default function Home() {
  return (
    <Suspense>
      <AnimatedLoginPage />
    </Suspense>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Sparkles, UserPlus, LogIn, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { sanitizeNextUrl } from "@/lib/auth-utils";
import { createClient } from "@/lib/supabase";
import { UserIcon } from "@/components/ui/user";
import MailFilledIcon from "@/components/ui/mail-filled-icon";
import { KeySquareIcon } from "@/components/ui/key-square";
import { EyeIcon } from "@/components/ui/eye";
import { EyeOffIcon } from "@/components/ui/eye-off";

const AUTH_REGISTRATION_PROJECT =
  process.env.NEXT_PUBLIC_AUTH_REGISTRATION_PROJECT || "palmaslake-agno";

/* ─────────────────────── Pupil ─────────────────────── */

interface PupilProps {
  size?: number;
  maxDistance?: number;
  pupilColor?: string;
  forceLookX?: number;
  forceLookY?: number;
}

const Pupil = ({
  size = 12,
  maxDistance = 5,
  pupilColor = "black",
  forceLookX,
  forceLookY,
}: PupilProps) => {
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);
  const pupilRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMouseX(e.clientX);
      setMouseY(e.clientY);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const calculatePupilPosition = () => {
    if (!pupilRef.current) return { x: 0, y: 0 };
    if (forceLookX !== undefined && forceLookY !== undefined) {
      return { x: forceLookX, y: forceLookY };
    }
    const pupil = pupilRef.current.getBoundingClientRect();
    const pupilCenterX = pupil.left + pupil.width / 2;
    const pupilCenterY = pupil.top + pupil.height / 2;
    const deltaX = mouseX - pupilCenterX;
    const deltaY = mouseY - pupilCenterY;
    const distance = Math.min(
      Math.sqrt(deltaX ** 2 + deltaY ** 2),
      maxDistance
    );
    const angle = Math.atan2(deltaY, deltaX);
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
  };

  const pupilPosition = calculatePupilPosition();

  return (
    <div
      ref={pupilRef}
      className="rounded-full transition-transform duration-75"
      style={{
        width: size,
        height: size,
        backgroundColor: pupilColor,
        transform: `translate(${pupilPosition.x}px, ${pupilPosition.y}px)`,
      }}
    />
  );
};

/* ─────────────────────── EyeBall ─────────────────────── */

interface EyeBallProps {
  size?: number;
  pupilSize?: number;
  maxDistance?: number;
  eyeColor?: string;
  pupilColor?: string;
  isBlinking?: boolean;
  forceLookX?: number;
  forceLookY?: number;
}

const EyeBall = ({
  size = 48,
  pupilSize = 16,
  maxDistance = 10,
  eyeColor = "white",
  pupilColor = "black",
  isBlinking = false,
  forceLookX,
  forceLookY,
}: EyeBallProps) => {
  return (
    <div
      className="rounded-full flex items-center justify-center transition-all duration-150"
      style={{
        width: size,
        height: isBlinking ? 3 : size,
        backgroundColor: eyeColor,
        borderRadius: isBlinking ? "50%" : "50%",
      }}
    >
      {!isBlinking && (
        <Pupil
          size={pupilSize}
          maxDistance={maxDistance}
          pupilColor={pupilColor}
          forceLookX={forceLookX}
          forceLookY={forceLookY}
        />
      )}
    </div>
  );
};

/* ─────────────────────── Login Page ─────────────────────── */

export default function AnimatedLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  /* ── Form state ── */
  const [mode, setMode] = useState<"login" | "register">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  /* ── Handle auth error/success from URL query params ── */
  useEffect(() => {
    const errorParam = searchParams.get("error");
    const errorCode = searchParams.get("error_code");
    const errorDesc = searchParams.get("error_description");

    if (errorParam || errorCode) {
      if (errorCode === "otp_expired") {
        setError("O link de confirmação expirou. Faça login ou cadastre-se novamente.");
      } else if (errorDesc) {
        setError(errorDesc.replace(/\+/g, " "));
      } else {
        setError("Erro na autenticação. Tente novamente.");
      }
      // Clean URL params without reload
      window.history.replaceState({}, "", "/");
    }
  }, [searchParams]);

  /* ── Animation state ── */
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);
  const [isPurpleBlinking, setIsPurpleBlinking] = useState(false);
  const [isBlackBlinking, setIsBlackBlinking] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isLookingAtEachOther, setIsLookingAtEachOther] = useState(false);
  const [isPurplePeeking, setIsPurplePeeking] = useState(false);

  const purpleRef = useRef<HTMLDivElement>(null);
  const blackRef = useRef<HTMLDivElement>(null);
  const yellowRef = useRef<HTMLDivElement>(null);
  const orangeRef = useRef<HTMLDivElement>(null);

  /* ── Mouse tracking ── */
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMouseX(e.clientX);
      setMouseY(e.clientY);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  /* ── Blinking effects ── */
  useEffect(() => {
    const getRandomBlinkInterval = () => Math.random() * 4000 + 3000;
    const scheduleBlink = () => {
      const blinkTimeout = setTimeout(() => {
        setIsPurpleBlinking(true);
        setTimeout(() => {
          setIsPurpleBlinking(false);
          scheduleBlink();
        }, 150);
      }, getRandomBlinkInterval());
      return blinkTimeout;
    };
    const timeout = scheduleBlink();
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const getRandomBlinkInterval = () => Math.random() * 4000 + 3000;
    const scheduleBlink = () => {
      const blinkTimeout = setTimeout(() => {
        setIsBlackBlinking(true);
        setTimeout(() => {
          setIsBlackBlinking(false);
          scheduleBlink();
        }, 150);
      }, getRandomBlinkInterval());
      return blinkTimeout;
    };
    const timeout = scheduleBlink();
    return () => clearTimeout(timeout);
  }, []);

  /* ── Look at each other when typing starts ── */
  useEffect(() => {
    if (isTyping) {
      setIsLookingAtEachOther(true);
      const timer = setTimeout(() => setIsLookingAtEachOther(false), 800);
      return () => clearTimeout(timer);
    } else {
      setIsLookingAtEachOther(false);
    }
  }, [isTyping]);

  /* ── Purple peeking when password visible ── */
  useEffect(() => {
    if (password.length > 0 && showPassword) {
      const schedulePeek = () => {
        const peekInterval = setTimeout(() => {
          setIsPurplePeeking(true);
          setTimeout(() => setIsPurplePeeking(false), 800);
        }, Math.random() * 3000 + 2000);
        return peekInterval;
      };
      const firstPeek = schedulePeek();
      return () => clearTimeout(firstPeek);
    } else {
      setIsPurplePeeking(false);
    }
  }, [password, showPassword, isPurplePeeking]);

  /* ── Position calculations ── */
  const calculatePosition = (ref: React.RefObject<HTMLDivElement | null>) => {
    if (!ref.current) return { faceX: 0, faceY: 0, bodySkew: 0 };
    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 3;
    const deltaX = mouseX - centerX;
    const deltaY = mouseY - centerY;
    const faceX = Math.max(-15, Math.min(15, deltaX / 20));
    const faceY = Math.max(-10, Math.min(10, deltaY / 30));
    const bodySkew = Math.max(-6, Math.min(6, -deltaX / 120));
    return { faceX, faceY, bodySkew };
  };

  const purplePos = calculatePosition(purpleRef);
  const blackPos = calculatePosition(blackRef);
  const yellowPos = calculatePosition(yellowRef);
  const orangePos = calculatePosition(orangeRef);

  /* ── Auth handlers ── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setIsLoading(true);

    if (mode === "register") {
      if (!fullName.trim()) {
        setError("Por favor, informe seu nome.");
        setIsLoading(false);
        return;
      }
      const cleanPhone = phone.replace(/\D/g, "");
      if (!cleanPhone || cleanPhone.length < 10) {
        setError("Por favor, informe um celular válido com DDD.");
        setIsLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setError("As senhas não coincidem.");
        setIsLoading(false);
        return;
      }
      if (password.length < 6) {
        setError("A senha deve ter pelo menos 6 caracteres.");
        setIsLoading(false);
        return;
      }
      const formattedPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            full_name: fullName.trim(),
            whatsapp_number: formattedPhone,
            registration_project: AUTH_REGISTRATION_PROJECT,
            project_schema: AUTH_REGISTRATION_PROJECT,
          },
        },
      });
      if (signUpError) {
        setError(signUpError.message);
      } else {
        setSuccess(
          "Conta criada com sucesso! Verifique seu email para confirmar."
        );
        setMode("login");
        setFullName("");
        setPhone("");
        setPassword("");
        setConfirmPassword("");
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError("Email ou senha incorretos. Tente novamente.");
      } else {
        const nextUrl = sanitizeNextUrl(searchParams.get("next"));
        router.push(nextUrl);
      }
    }

    setIsLoading(false);
  };

  const isPasswordHidden = password.length > 0 && !showPassword;
  const isPasswordVisible = password.length > 0 && showPassword;

  /* ── Theme colors (Palmas Lake) — referencing CSS variables ── */
  const colors = {
    purple: "var(--primary)",
    black: "var(--foreground)",
    orange: "var(--destructive)",
    yellow: "var(--secondary)",
  };

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-muted/30 p-4">
      <div className="flex w-full max-w-[1000px] overflow-hidden rounded-2xl bg-background shadow-xl border border-border/40" style={{ minHeight: "600px", maxHeight: "700px" }}>
      {/* ─── Left Content Section (hidden on mobile) ─── */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between p-8 bg-gradient-to-br from-primary/5 via-muted/50 to-accent/5">
        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="Palmas Lake"
            width={180}
            height={48}
            className="h-10 w-auto"
            priority
          />
        </div>

        {/* Animated Characters */}
        <div className="flex-1 flex items-end justify-center relative pb-0">
          {/* Purple tall character – Back layer (leftmost) */}
          <div
            ref={purpleRef}
            className="absolute bottom-0 transition-transform duration-300 ease-out"
            style={{
              left: "8%",
              width: "100px",
              height:
                isTyping || isPasswordHidden
                  ? "440px"
                  : "400px",
              backgroundColor: colors.purple,
              borderRadius: "10px 10px 0 0",
              zIndex: 1,
              transform: isPasswordVisible
                ? "skewX(0deg)"
                : isTyping || isPasswordHidden
                ? `skewX(${(purplePos.bodySkew || 0) - 12}deg) translateX(40px)`
                : `skewX(${purplePos.bodySkew || 0}deg)`,
              transformOrigin: "bottom center",
            }}
          >
            <div
              className="absolute flex gap-3 transition-all duration-300"
              style={{
                left: isPasswordVisible
                  ? "20px"
                  : isLookingAtEachOther
                  ? "55px"
                  : `${45 + purplePos.faceX}px`,
                top: isPasswordVisible
                  ? "35px"
                  : isLookingAtEachOther
                  ? "65px"
                  : `${40 + purplePos.faceY}px`,
              }}
            >
              <EyeBall
                size={22}
                pupilSize={10}
                maxDistance={5}
                isBlinking={isPurpleBlinking}
                forceLookX={
                  isPasswordVisible
                    ? isPurplePeeking
                      ? 4
                      : -4
                    : isLookingAtEachOther
                    ? 3
                    : undefined
                }
                forceLookY={
                  isPasswordVisible
                    ? isPurplePeeking
                      ? 5
                      : -4
                    : isLookingAtEachOther
                    ? 4
                    : undefined
                }
              />
              <EyeBall
                size={22}
                pupilSize={10}
                maxDistance={5}
                isBlinking={isPurpleBlinking}
                forceLookX={
                  isPasswordVisible
                    ? isPurplePeeking
                      ? 4
                      : -4
                    : isLookingAtEachOther
                    ? 3
                    : undefined
                }
                forceLookY={
                  isPasswordVisible
                    ? isPurplePeeking
                      ? 5
                      : -4
                    : isLookingAtEachOther
                    ? 4
                    : undefined
                }
              />
            </div>
          </div>

          {/* Dark character – Middle layer */}
          <div
            ref={blackRef}
            className="absolute bottom-0 transition-transform duration-300 ease-out"
            style={{
              left: "28%",
              width: "80px",
              height: "300px",
              backgroundColor: colors.black,
              borderRadius: "10px 10px 0 0",
              zIndex: 2,
              transform: isPasswordVisible
                ? "skewX(0deg)"
                : isLookingAtEachOther
                ? `skewX(${(blackPos.bodySkew || 0) * 1.5 + 10}deg) translateX(20px)`
                : isTyping || isPasswordHidden
                ? `skewX(${(blackPos.bodySkew || 0) * 1.5}deg)`
                : `skewX(${blackPos.bodySkew || 0}deg)`,
              transformOrigin: "bottom center",
            }}
          >
            <div
              className="absolute flex gap-2 transition-all duration-300"
              style={{
                left: isPasswordVisible
                  ? "10px"
                  : isLookingAtEachOther
                  ? "32px"
                  : `${26 + blackPos.faceX}px`,
                top: isPasswordVisible
                  ? "28px"
                  : isLookingAtEachOther
                  ? "12px"
                  : `${32 + blackPos.faceY}px`,
              }}
            >
              <EyeBall
                size={18}
                pupilSize={8}
                maxDistance={4}
                isBlinking={isBlackBlinking}
                forceLookX={
                  isPasswordVisible
                    ? -4
                    : isLookingAtEachOther
                    ? 0
                    : undefined
                }
                forceLookY={
                  isPasswordVisible
                    ? -4
                    : isLookingAtEachOther
                    ? -4
                    : undefined
                }
              />
              <EyeBall
                size={18}
                pupilSize={8}
                maxDistance={4}
                isBlinking={isBlackBlinking}
                forceLookX={
                  isPasswordVisible
                    ? -4
                    : isLookingAtEachOther
                    ? 0
                    : undefined
                }
                forceLookY={
                  isPasswordVisible
                    ? -4
                    : isLookingAtEachOther
                    ? -4
                    : undefined
                }
              />
            </div>
          </div>

          {/* Orange semi-circle character – Center */}
          <div
            ref={orangeRef}
            className="absolute bottom-0 transition-transform duration-300 ease-out"
            style={{
              left: "48%",
              width: "200px",
              height: "200px",
              backgroundColor: colors.orange,
              borderRadius: "100px 100px 0 0",
              zIndex: 3,
              transform: isPasswordVisible
                ? "skewX(0deg)"
                : `skewX(${orangePos.bodySkew || 0}deg)`,
              transformOrigin: "bottom center",
            }}
          >
            <div
              className="absolute flex gap-4 transition-all duration-300"
              style={{
                left: isPasswordVisible
                  ? "50px"
                  : `${82 + (orangePos.faceX || 0)}px`,
                top: isPasswordVisible
                  ? "85px"
                  : `${90 + (orangePos.faceY || 0)}px`,
              }}
            >
              <Pupil
                size={14}
                maxDistance={5}
                forceLookX={isPasswordVisible ? -5 : undefined}
                forceLookY={isPasswordVisible ? -4 : undefined}
              />
              <Pupil
                size={14}
                maxDistance={5}
                forceLookX={isPasswordVisible ? -5 : undefined}
                forceLookY={isPasswordVisible ? -4 : undefined}
              />
            </div>
          </div>

          {/* Beige tall character – Rightmost */}
          <div
            ref={yellowRef}
            className="absolute bottom-0 transition-transform duration-300 ease-out"
            style={{
              right: "5%",
              width: "90px",
              height: "220px",
              backgroundColor: colors.yellow,
              borderRadius: "45px 45px 0 0",
              zIndex: 3,
              transform: isPasswordVisible
                ? "skewX(0deg)"
                : `skewX(${yellowPos.bodySkew || 0}deg)`,
              transformOrigin: "bottom center",
            }}
          >
            <div
              className="absolute flex gap-3 transition-all duration-300"
              style={{
                left: isPasswordVisible
                  ? "20px"
                  : `${30 + (yellowPos.faceX || 0)}px`,
                top: isPasswordVisible
                  ? "35px"
                  : `${40 + (yellowPos.faceY || 0)}px`,
              }}
            >
              <Pupil
                size={12}
                maxDistance={5}
                forceLookX={isPasswordVisible ? -5 : undefined}
                forceLookY={isPasswordVisible ? -4 : undefined}
              />
              <Pupil
                size={12}
                maxDistance={5}
                forceLookX={isPasswordVisible ? -5 : undefined}
                forceLookY={isPasswordVisible ? -4 : undefined}
              />
            </div>
            {/* Mouth */}
            <div
              className="absolute w-6 h-0.5 bg-foreground/60 rounded-full transition-all duration-300"
              style={{
                left: isPasswordVisible
                  ? "10px"
                  : `${28 + (yellowPos.faceX || 0)}px`,
                top: isPasswordVisible
                  ? "88px"
                  : `${88 + (yellowPos.faceY || 0)}px`,
              }}
            />
          </div>
        </div>

        {/* Decorative sparkles */}
        <div className="absolute top-20 right-20 text-primary/20">
          <Sparkles className="w-8 h-8" />
        </div>
        <div className="absolute bottom-40 left-10 text-accent/20">
          <Sparkles className="w-6 h-6" />
        </div>
      </div>

      {/* ─── Right Login Section ─── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-8 overflow-y-auto">
        <div className="w-full max-w-sm space-y-6">
          {/* Mobile Logo */}
          <div className="lg:hidden flex justify-center">
            <Image
              src="/logo.png"
              alt="Palmas Lake"
              width={200}
              height={54}
              className="h-12 w-auto"
              priority
            />
          </div>

          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground font-display">
              {mode === "login" ? "Bem-vindo de volta!" : "Criar conta"}
            </h1>
            <p className="text-muted-foreground">
              {mode === "login"
                ? "Entre com suas credenciais"
                : "Preencha os dados para se cadastrar"}
            </p>
          </div>

          {/* Success message */}
          {success && (
            <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm text-center">
              {success}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name field (register mode only) */}
            {mode === "register" && (
              <div className="space-y-2">
                <Label htmlFor="full-name">Nome</Label>
                <div className="relative">
                  <UserIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="full-name"
                    type="text"
                    placeholder="Seu nome completo"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    onFocus={() => setIsTyping(true)}
                    onBlur={() => setIsTyping(false)}
                    required
                    className="h-12 pl-10 bg-background border-border/60 focus:border-primary"
                  />
                </div>
              </div>
            )}

            {/* Phone field (register mode only) */}
            {mode === "register" && (
              <div className="space-y-2">
                <Label htmlFor="phone">Celular (WhatsApp)</Label>
                <div className="relative">
                  <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="(27) 99872-4593"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onFocus={() => setIsTyping(true)}
                    onBlur={() => setIsTyping(false)}
                    required
                    className="h-12 pl-10 bg-background border-border/60 focus:border-primary"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email-address">Email</Label>
              <div className="relative">
                <MailFilledIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email-address"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setIsTyping(true)}
                  onBlur={() => setIsTyping(false)}
                  required
                  className="h-12 pl-10 bg-background border-border/60 focus:border-primary"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <KeySquareIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setIsTyping(true)}
                  onBlur={() => setIsTyping(false)}
                  required
                  className="h-12 pl-10 pr-10 bg-background border-border/60 focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? (
                    <EyeOffIcon size={16} />
                  ) : (
                    <EyeIcon size={16} />
                  )}
                </button>
              </div>
            </div>

            {/* Confirm password (register mode) */}
            {mode === "register" && (
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar senha</Label>
                <div className="relative">
                  <KeySquareIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="confirm-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onFocus={() => setIsTyping(true)}
                    onBlur={() => setIsTyping(false)}
                    required
                    className="h-12 pl-10 bg-background border-border/60 focus:border-primary"
                  />
                </div>
              </div>
            )}

            {/* Remember me (login only) */}
            {mode === "login" && (
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Checkbox id="remember" checked={rememberMe} onCheckedChange={(checked) => setRememberMe(checked === true)} />
                  <Label
                    htmlFor="remember"
                    className="text-sm text-muted-foreground cursor-pointer"
                  >
                    Lembrar por 30 dias
                  </Label>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm text-center">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  {mode === "login" ? "Entrando..." : "Cadastrando..."}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  {mode === "login" ? (
                    <>
                      <LogIn className="h-4 w-4" />
                      Entrar
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4" />
                      Criar conta
                    </>
                  )}
                </span>
              )}
            </Button>
          </form>

          {/* Toggle login/register */}
          <p className="text-center text-sm text-muted-foreground">
            {mode === "login" ? (
              <>
                Não tem uma conta?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("register");
                    setError("");
                    setSuccess("");
                  }}
                  className="font-semibold text-primary hover:underline"
                >
                  Cadastre-se
                </button>
              </>
            ) : (
              <>
                Já tem uma conta?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setError("");
                    setSuccess("");
                  }}
                  className="font-semibold text-primary hover:underline"
                >
                  Entrar
                </button>
              </>
            )}
          </p>
        </div>
      </div>
      </div>
    </main>
  );
}

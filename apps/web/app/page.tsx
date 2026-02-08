"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import {
  Waves,
  MapPin,
  ShieldCheck,
  Zap,
  Car,
  Home as HomeIcon,
  Trees,
  Waves as PoolIcon,
  Crown
} from "lucide-react";

const IMAGE_HERO = "https://bokdkbgrtaarlqzxjcgm.supabase.co/storage/v1/object/sign/palmas/palmas%201.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8yMzZlODkxZC02YWM3LTQ2NzgtOGZiOC1hYjllNzY0MTY3MjEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJwYWxtYXMvcGFsbWFzIDEuanBlZyIsImlhdCI6MTc2NjAwMTU2MywiZXhwIjozNjgwMjQ5NzU2M30.Hy4d1sa9UoEG0k68gZRUragGz2nMgWHJ7unQY8v1NXA";

export default function Home() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { type: "spring" as const, stiffness: 100 }
    }
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden selection:bg-primary selection:text-white">
      {/* Background Aurora Blobs */}
      <div className="fixed inset-0 -z-10 bg-background">
        <div className="absolute top-[-10%] left-[-10%] h-[600px] w-[600px] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute bottom-[10%] right-[-5%] h-[500px] w-[500px] rounded-full bg-accent/10 blur-[100px]" />
      </div>

      {/* Navigation */}
      <nav className="fixed top-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-8 rounded-full border border-white/20 bg-white/40 px-8 py-3 backdrop-blur-md dark:bg-black/40">
        <span className="font-display text-lg font-bold tracking-widest">PALMAS LAKE</span>
        <div className="hidden items-center gap-6 text-sm font-medium md:flex">
          <a href="#" className="transition-colors hover:text-primary">O Empreendimento</a>
          <a href="#" className="transition-colors hover:text-primary">Tipologias</a>
          <a href="#" className="transition-colors hover:text-primary">Lazer</a>
        </div>
        <button className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-white transition-all hover:scale-105 active:scale-95">
          Agendar Visita
        </button>
      </nav>

      {/* Hero Section */}
      <header className="relative flex min-h-screen flex-col items-center justify-center pt-24 pb-12">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          className="container relative z-10 px-6 text-center"
        >
          <motion.div variants={itemVariants} className="mb-4 flex justify-center">
            <span className="flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-xs font-bold tracking-widest text-primary uppercase">
              <Crown className="size-3" />
              Alto Padrão em Palmas
            </span>
          </motion.div>

          <motion.h1
            variants={itemVariants}
            className="font-display mb-6 text-6xl font-bold leading-[1.1] tracking-tight md:text-8xl"
          >
            Palmas Lake <br />
            <span className="text-primary italic">Residence</span>
          </motion.h1>

          <motion.p
            variants={itemVariants}
            className="mx-auto mb-10 max-w-2xl text-lg text-foreground/70 md:text-xl"
          >
            Viva a exclusividade de um condomínio de luxo com vista permanente para o Lago de Palmas. Elegância, sustentabilidade e lazer de nível internacional.
          </motion.p>

          <motion.div variants={itemVariants} className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <button className="h-14 rounded-luxury bg-primary px-10 text-lg font-bold text-white shadow-xl transition-all hover:bg-primary/90 hover:scale-[1.02]">
              Conhecer Tipologias
            </button>
            <button className="h-14 rounded-luxury border-2 border-primary/20 bg-white/50 px-10 text-lg font-bold backdrop-blur-sm transition-all hover:bg-white/80">
              Ver Localização
            </button>
          </motion.div>
        </motion.div>

        {/* Hero Background Image */}
        <div className="absolute inset-0 top-0 -z-20 h-full w-full opacity-20">
          <Image
            src={IMAGE_HERO}
            alt="Palmas Lake Residence"
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
        </div>
      </header>

      {/* Features Grid */}
      <section className="container mx-auto px-6 py-24">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          <FeatureCard
            icon={<MapPin className="text-primary" />}
            title="Localização Nobre"
            desc="Quadra 108 Sul, a apenas 8 minutos do centro."
          />
          <FeatureCard
            icon={<PoolIcon className="text-primary" />}
            title="Prainha Artificial"
            desc="Areia branca e piscina de borda infinita com vista lago."
          />
          <FeatureCard
            icon={<Zap className="text-primary" />}
            title="Sustentabilidade"
            desc="Energia solar e tomada para carros elétricos inclusas."
          />
          <FeatureCard
            icon={<ShieldCheck className="text-primary" />}
            title="Entrega em 2027"
            desc="Obra em ritimo acelerado pela Palmas Lake Incorporações."
          />
        </div>
      </section>

      {/* Tipologias - Staggered Glass Cards */}
      <section className="bg-primary/5 py-24">
        <div className="container mx-auto px-6">
          <div className="mb-16 text-center">
            <h2 className="font-display mb-4 text-4xl font-bold">Residências Exclusivas</h2>
            <p className="text-foreground/60">Escolha a planta que melhor se adapta ao seu estilo de vida.</p>
          </div>

          <div className="grid gap-8 lg:grid-cols-3">
            <TypeCard
              title="Padrão"
              meters="128m²"
              features={["3 Suítes", "Varanda Gourmet", "Vista Lago", "2 Vagas"]}
              price="A partir de R$ 1.180.000"
            />
            <TypeCard
              title="Garden"
              meters="145m² + 80m²"
              features={["3 Suítes", "Quintal Privativo", "Churrasqueira", "2 Vagas"]}
              highlight
              price="A partir de R$ 1.450.000"
            />
            <TypeCard
              title="Penthouse"
              meters="198m²"
              features={["4 Suítes", "Piscina Privativa", "Terraço Panorâmico", "3 Vagas"]}
              price="A partir de R$ 2.350.000"
            />
          </div>
        </div>
      </section>

      {/* Footer / Final CTA */}
      <footer className="container mx-auto px-6 py-24 text-center">
        <h3 className="font-display mb-8 text-3xl font-bold">Agende sua visita ao stand</h3>
        <p className="mb-12 text-foreground/60">Av. Teotônio Segurado, Quadra 108 Sul. Venha conhecer a maquete e o decorado.</p>
        <button className="h-16 rounded-full bg-accent px-12 text-xl font-bold text-white shadow-2xl transition-all hover:scale-105 active:scale-95">
          Falar com a Maria agora
        </button>
        <div className="mt-24 border-t border-primary/10 pt-12 text-sm text-foreground/40">
          © 2026 Palmas Lake Incorporações. Todos os direitos reservados.
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <div className="glass-card group rounded-luxury p-8 transition-all hover:-translate-y-2 hover:bg-white hover:shadow-2xl">
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 transition-colors group-hover:bg-primary group-hover:text-white">
        {icon}
      </div>
      <h3 className="mb-3 text-xl font-bold">{title}</h3>
      <p className="text-sm leading-relaxed text-foreground/60">{desc}</p>
    </div>
  );
}

function TypeCard({ title, meters, features, price, highlight }: any) {
  return (
    <div className={`glass-card relative flex flex-col rounded-[32px] p-10 transition-all hover:scale-[1.02] ${highlight ? 'ring-2 ring-primary shadow-2xl scale-[1.05] z-10 bg-white' : ''}`}>
      {highlight && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-[10px] font-bold tracking-widest text-white uppercase">
          Destaque
        </div>
      )}
      <div className="mb-8 border-b border-primary/5 pb-8">
        <h3 className="font-display text-2xl font-bold">{title}</h3>
        <p className="text-4xl font-bold text-primary mt-2">{meters}</p>
      </div>

      <ul className="mb-12 flex flex-1 flex-col gap-4">
        {features.map((f: string) => (
          <li key={f} className="flex items-center gap-3 text-sm text-foreground/80">
            <ShieldCheck className="size-4 text-primary" />
            {f}
          </li>
        ))}
      </ul>

      <div className="mt-auto">
        <p className="mb-6 text-sm font-medium text-foreground/40">{price}</p>
        <button className={`w-full h-12 rounded-full font-bold transition-all ${highlight ? 'bg-primary text-white hover:bg-primary/90 shadow-lg' : 'border border-primary text-primary hover:bg-primary/5'}`}>
          Mais detalhes
        </button>
      </div>
    </div>
  );
}

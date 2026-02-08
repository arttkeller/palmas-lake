# Task: Modern Glassy Redesign - Palmas Lake

## 🎯 Goal
Implement a premium, modern web interface for Palmas Lake Residence using glassmorphism, rounded corners, and dynamic animations.

## 🎨 Design Commitment: Aurora Emerald Glass
- **Geometry:** Large rounded corners (24px - 32px) for a friendly yet premium lifestyle feel.
- **Topology:** Layered depth with overlapping glass cards and asymmetric hero layout.
- **Palette:** Teal (#0F766E) and Aquatic whites (#F0FDFA) with Blue (#0369A1) accents. No Purple!
- **Typography:** Cinzel (Headers) + Josefin Sans (Body).

## 🛠️ Tech Stack
- **Framework:** Next.js (App Router)
- **Styling:** Tailwind CSS v4
- **Icons:** Lucide-react (SVG)
- **Animations:** Framer Motion (for staggered reveals and micro-interactions)

## 📋 Task Breakdown

### Phase 1: Foundation (Design Intent)
- [ ] Configure `globals.css` with CSS variables for the color palette and typography.
- [ ] Update `tailwind.config` (if using v3) or `@theme` (if using v4) with tokens.

### Phase 2: Core Components (Glassmorphism)
- [ ] `GlassNav`: Floating navigation bar with `backdrop-blur` and subtle borders.
- [ ] `GlassCard`: Reusable component for displaying property features and stats.
- [ ] `AuroraBackground`: Gradient blobs for the glassy depth effect.

### Phase 3: Page Assembly
- [ ] **Hero Section**: Massive headline "Palmas Lake Residence" with a parallax background of the lake.
- [ ] **Property Showcase**: Grid of units (Garden, Padrão, Penthouse) using GlassCards.
- [ ] **Amenities Section**: Grid of over 3,000m² of leisure areas.
- [ ] **Agendamento CTA**: Bold section to drive visits.

### Phase 4: Polish & Interaction
- [ ] Add staggered reveal animations to all sections.
- [ ] Implement spring-physics hover states on buttons and cards.
- [ ] Verify accessibility and device responsiveness.

## 🚀 Execution
1. Update `apps/web/app/globals.css`.
2. Install `framer-motion` and `lucide-react`.
3. Rebuild `apps/web/app/page.tsx`.


-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- USERS Table (Extends Supabase Auth if needed, or standalone)
create table if not exists public.users (
  id uuid references auth.users on delete cascade not null primary key,
  email text,
  full_name text,
  role text default 'agent' check (role in ('admin', 'agent')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- LEADS Table (The "Cards" in Kanban)
create table if not exists public.leads (
  id uuid default uuid_generate_v4() primary key,
  full_name text not null,
  phone text unique not null,
  email text,
  status text default 'new' check (status in ('new', 'contacted', 'visit_scheduled', 'sold', 'lost')),
  notes text,
  assigned_to uuid references public.users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- CONVERSATIONS Table (One per Lead per Platform)
create table if not exists public.conversations (
  id uuid default uuid_generate_v4() primary key,
  lead_id uuid references public.leads(id) on delete cascade not null,
  platform text check (platform in ('whatsapp', 'instagram')) not null,
  platform_thread_id text, -- ID from Meta (wa_id or ig_id)
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(lead_id, platform)
);

-- MESSAGES Table (Chat History)
create table if not exists public.messages (
  id uuid default uuid_generate_v4() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  sender_type text check (sender_type in ('user', 'ai', 'lead')) not null,
  content text,
  message_type text default 'text' check (message_type in ('text', 'image', 'audio', 'video')),
  metadata jsonb default '{}'::jsonb, -- Store media URLs, duration, etc.
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS)
alter table public.users enable row level security;
alter table public.leads enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- Simple Policies (Open for now, lock down later)
create policy "Enable all access for authenticated users" on public.leads for all using (auth.role() = 'authenticated');
create policy "Enable all access for authenticated users" on public.conversations for all using (auth.role() = 'authenticated');
create policy "Enable all access for authenticated users" on public.messages for all using (auth.role() = 'authenticated');

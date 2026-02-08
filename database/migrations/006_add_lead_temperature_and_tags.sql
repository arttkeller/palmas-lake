-- Migration: Add lead temperature classification and tags system
-- Requirements: 4.3, 4.4 - AI tag storage with timestamps and classification history

-- Add temperature column to leads table
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS temperature VARCHAR(10) DEFAULT NULL 
  CHECK (temperature IN ('hot', 'warm', 'cold'));

-- Add last AI analysis timestamp
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_ai_analysis TIMESTAMP WITH TIME ZONE;

-- Lead tags table for AI-generated and user-created tags
CREATE TABLE IF NOT EXISTS public.lead_tags (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL CHECK (category IN ('temperature', 'interest', 'behavior', 'custom')),
  value TEXT,
  confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_by VARCHAR(10) DEFAULT 'ai' CHECK (created_by IN ('ai', 'user'))
);

-- Classification history table to preserve previous classifications
CREATE TABLE IF NOT EXISTS public.lead_classification_history (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  previous_temperature VARCHAR(10) CHECK (previous_temperature IN ('hot', 'warm', 'cold')),
  new_temperature VARCHAR(10) CHECK (new_temperature IN ('hot', 'warm', 'cold')),
  reason TEXT,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_lead_tags_lead_id ON public.lead_tags(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_tags_category ON public.lead_tags(category);
CREATE INDEX IF NOT EXISTS idx_lead_tags_created_at ON public.lead_tags(created_at);
CREATE INDEX IF NOT EXISTS idx_classification_history_lead_id ON public.lead_classification_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_classification_history_changed_at ON public.lead_classification_history(changed_at);
CREATE INDEX IF NOT EXISTS idx_leads_temperature ON public.leads(temperature);

-- Enable Row Level Security
ALTER TABLE public.lead_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_classification_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for lead_tags
CREATE POLICY "Enable all access for authenticated users" ON public.lead_tags 
  FOR ALL USING (auth.role() = 'authenticated');

-- RLS Policies for lead_classification_history
CREATE POLICY "Enable all access for authenticated users" ON public.lead_classification_history 
  FOR ALL USING (auth.role() = 'authenticated');

-- Enable realtime for temperature updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_tags;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_classification_history;

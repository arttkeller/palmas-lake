'use client';

import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import { Loader2, Plus, X, Flame, Sun, Snowflake } from 'lucide-react';

// ---------- Types ----------

interface NewLeadFormData {
  full_name: string;
  phone: string;
  email: string;
  source: string;
  classification_type: string;
  interest_type: string;
  temperature: string;
  tags: string[];
  budget_range: string;
  city_origin: string;
  notes: string;
}

const INITIAL_FORM: NewLeadFormData = {
  full_name: '',
  phone: '',
  email: '',
  source: '',
  classification_type: '',
  interest_type: '',
  temperature: '',
  tags: [],
  budget_range: '',
  city_origin: '',
  notes: '',
};

const SOURCE_OPTIONS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'site', label: 'Site' },
  { value: 'indicacao', label: 'Indicacao' },
  { value: 'estande', label: 'Estande' },
];

const CLASSIFICATION_OPTIONS = [
  { value: 'cliente_final', label: 'Cliente Final' },
  { value: 'corretor', label: 'Corretor' },
  { value: 'investidor', label: 'Investidor' },
];

const INTEREST_OPTIONS = [
  { value: 'apartamento', label: 'Apartamento' },
  { value: 'sala_comercial', label: 'Sala Comercial' },
  { value: 'office', label: 'Office' },
  { value: 'flat', label: 'Flat' },
  { value: 'loft', label: 'Loft' },
];

const TEMPERATURE_OPTIONS = [
  { value: 'hot', label: 'Quente', icon: Flame, color: 'text-orange-500', bg: 'bg-orange-500/20', ring: 'ring-orange-500' },
  { value: 'warm', label: 'Morno', icon: Sun, color: 'text-amber-500', bg: 'bg-amber-500/20', ring: 'ring-amber-500' },
  { value: 'cold', label: 'Frio', icon: Snowflake, color: 'text-blue-400', bg: 'bg-blue-400/20', ring: 'ring-blue-400' },
];

// ---------- Component ----------

interface NewLeadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeadCreated: () => void;
}

export function NewLeadModal({ open, onOpenChange, onLeadCreated }: NewLeadModalProps) {
  const [form, setForm] = useState<NewLeadFormData>(INITIAL_FORM);
  const [tagInput, setTagInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateField = useCallback(<K extends keyof NewLeadFormData>(field: K, value: NewLeadFormData[K]) => {
    setForm(prev => ({ ...prev, [field]: value }));
  }, []);

  const addTag = useCallback(() => {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag)) {
      setForm(prev => ({ ...prev, tags: [...prev.tags, tag] }));
      setTagInput('');
    }
  }, [tagInput, form.tags]);

  const removeTag = useCallback((tagToRemove: string) => {
    setForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tagToRemove) }));
  }, []);

  const handleTagKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  }, [addTag]);

  const resetForm = useCallback(() => {
    setForm(INITIAL_FORM);
    setTagInput('');
    setError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    // Validation
    if (!form.full_name.trim()) {
      setError('Nome completo e obrigatorio');
      return;
    }
    if (!form.phone.trim()) {
      setError('Telefone e obrigatorio');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Build payload, only include non-empty fields
      const payload: Record<string, unknown> = {
        full_name: form.full_name.trim(),
        phone: form.phone.trim().replace(/\D/g, ''),
        status: 'novo_lead',
      };

      if (form.email.trim()) payload.email = form.email.trim();
      if (form.source) payload.source = form.source;
      if (form.classification_type) payload.classification_type = form.classification_type;
      if (form.interest_type) payload.interest_type = form.interest_type;
      if (form.temperature) payload.temperature = form.temperature;
      if (form.tags.length > 0) payload.tags = form.tags;
      if (form.budget_range.trim()) payload.budget_range = form.budget_range.trim();
      if (form.city_origin.trim()) payload.city_origin = form.city_origin.trim();
      if (form.notes.trim()) {
        payload.notes = form.notes.trim();
        payload.conversation_summary = form.notes.trim();
      }

      const res = await apiFetch(`/api/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const detail = await res.text();
        throw new Error(detail || 'Erro ao criar lead');
      }

      resetForm();
      onOpenChange(false);
      onLeadCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setIsSubmitting(false);
    }
  }, [form, resetForm, onOpenChange, onLeadCreated]);

  const handleOpenChange = useCallback((value: boolean) => {
    if (!value) resetForm();
    onOpenChange(value);
  }, [onOpenChange, resetForm]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Novo Lead</DialogTitle>
          <DialogDescription>
            Registre um novo lead no sistema. A IA usara essas informacoes quando o lead entrar em contato.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          {/* ---- Dados Basicos ---- */}
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground/70 uppercase tracking-wider">Dados Basicos</h3>
            <div className="h-px bg-border" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Nome completo *</Label>
              <Input
                id="full_name"
                placeholder="Ex: Joao da Silva"
                value={form.full_name}
                onChange={e => updateField('full_name', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone *</Label>
              <Input
                id="phone"
                placeholder="Ex: 5563999999999"
                value={form.phone}
                onChange={e => updateField('phone', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="email@exemplo.com"
                value={form.email}
                onChange={e => updateField('email', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="source">Origem</Label>
              <Select value={form.source} onValueChange={v => updateField('source', v)}>
                <SelectTrigger id="source">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ---- Classificacao ---- */}
          <div className="space-y-1 pt-2">
            <h3 className="text-sm font-semibold text-foreground/70 uppercase tracking-wider">Classificacao</h3>
            <div className="h-px bg-border" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="classification_type">Tipo de cliente</Label>
              <Select value={form.classification_type} onValueChange={v => updateField('classification_type', v)}>
                <SelectTrigger id="classification_type">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {CLASSIFICATION_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="interest_type">Interesse</Label>
              <Select value={form.interest_type} onValueChange={v => updateField('interest_type', v)}>
                <SelectTrigger id="interest_type">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {INTEREST_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="budget_range">Orcamento</Label>
              <Input
                id="budget_range"
                placeholder="Ex: R$ 300.000 - R$ 500.000"
                value={form.budget_range}
                onChange={e => updateField('budget_range', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city_origin">Cidade de origem</Label>
              <Input
                id="city_origin"
                placeholder="Ex: Palmas - TO"
                value={form.city_origin}
                onChange={e => updateField('city_origin', e.target.value)}
              />
            </div>
          </div>

          {/* ---- Temperatura ---- */}
          <div className="space-y-1 pt-2">
            <h3 className="text-sm font-semibold text-foreground/70 uppercase tracking-wider">Temperatura</h3>
            <div className="h-px bg-border" />
          </div>

          <div className="flex gap-3">
            {TEMPERATURE_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const isSelected = form.temperature === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateField('temperature', isSelected ? '' : opt.value)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all cursor-pointer',
                    'text-sm font-medium',
                    isSelected
                      ? `${opt.bg} ${opt.color} border-current ring-1 ${opt.ring}`
                      : 'border-border bg-background hover:bg-muted/50 text-muted-foreground'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* ---- Tags ---- */}
          <div className="space-y-1 pt-2">
            <h3 className="text-sm font-semibold text-foreground/70 uppercase tracking-wider">Tags</h3>
            <div className="h-px bg-border" />
          </div>

          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Adicionar tag e pressionar Enter..."
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                className="flex-1"
              />
              <Button type="button" variant="outline" size="icon" onClick={addTag} disabled={!tagInput.trim()}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="px-3 py-1 text-sm gap-1.5">
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)} className="hover:text-destructive transition-colors cursor-pointer">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* ---- Observacoes ---- */}
          <div className="space-y-1 pt-2">
            <h3 className="text-sm font-semibold text-foreground/70 uppercase tracking-wider">Observacoes</h3>
            <div className="h-px bg-border" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Resumo / Anotacoes do corretor</Label>
            <Textarea
              id="notes"
              placeholder="Ex: Cliente veio presencialmente, interessado em apartamento de 2 quartos na torre Sky. Pretende comprar nos proximos 3 meses..."
              value={form.notes}
              onChange={e => updateField('notes', e.target.value)}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Essas anotacoes serao usadas pela IA como contexto quando o lead entrar em contato pelo WhatsApp.
            </p>
          </div>
        </div>

        {/* ---- Error ---- */}
        {error && (
          <div className="bg-destructive/10 text-destructive text-sm rounded-lg px-4 py-3 border border-destructive/20">
            {error}
          </div>
        )}

        {/* ---- Footer ---- */}
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Criando...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Criar Lead
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


'use client';

import { useEffect, useState, useCallback } from 'react';
import { Save, Users, Shield, ShieldCheck, Trash2, Loader2, LogOut, ArrowRight } from 'lucide-react';
import { PhoneLottieIcon } from '@/components/icons/phone-lottie';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/lib/api-config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface CrmUser {
    id: string;
    email: string;
    full_name: string;
    role: 'admin' | 'user';
    created_at: string | null;
    is_seller?: boolean;
    seller_active?: boolean;
    whatsapp_number?: string;
    seller_order?: number;
    last_assigned_at?: string | null;
}

interface RotationState {
    current_seller_id: string | null;
    total_assignments: number;
    updated_at: string | null;
    current_seller?: {
        id: string;
        full_name: string;
        whatsapp_number: string;
        seller_order: number;
    } | null;
}

export default function SettingsPage() {
    const { crmUser, isAdmin, user, refreshUser } = useAuth();
    const router = useRouter();
    const supabase = createClient();

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/');
    };

    // Profile form state
    const [profileName, setProfileName] = useState('');
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileSaved, setProfileSaved] = useState(false);

    // User management state (admin only)
    const [allUsers, setAllUsers] = useState<CrmUser[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [updatingRole, setUpdatingRole] = useState<string | null>(null);

    // Seller management state
    const [updatingSeller, setUpdatingSeller] = useState<string | null>(null);
    const [rotationState, setRotationState] = useState<RotationState | null>(null);
    const [editingWhatsApp, setEditingWhatsApp] = useState<{ [id: string]: string }>({});

    // Sync profile name from context
    useEffect(() => {
        if (crmUser) {
            setProfileName(crmUser.full_name || '');
        }
    }, [crmUser]);

    // Fetch all users (admin only)
    const fetchUsers = useCallback(async () => {
        if (!isAdmin) return;
        setLoadingUsers(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/users`);
            if (res.ok) {
                const data = await res.json();
                setAllUsers(data);
            }
        } catch (err) {
            console.error('Error fetching users:', err);
        } finally {
            setLoadingUsers(false);
        }
    }, [isAdmin]);

    // Fetch rotation state
    const fetchRotationState = useCallback(async () => {
        if (!isAdmin) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/sellers/state`);
            if (res.ok) {
                const data = await res.json();
                setRotationState(data);
            }
        } catch (err) {
            console.error('Error fetching rotation state:', err);
        }
    }, [isAdmin]);

    useEffect(() => {
        fetchUsers();
        fetchRotationState();
    }, [fetchUsers, fetchRotationState]);

    // Save profile
    const handleSaveProfile = async () => {
        if (!user) return;
        setSavingProfile(true);
        setProfileSaved(false);
        try {
            const res = await fetch(`${API_BASE_URL}/api/users/${user.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ full_name: profileName }),
            });
            if (res.ok) {
                setProfileSaved(true);
                await refreshUser();
                setTimeout(() => setProfileSaved(false), 3000);
            }
        } catch (err) {
            console.error('Error saving profile:', err);
        } finally {
            setSavingProfile(false);
        }
    };

    // Change user role (admin only)
    const handleRoleChange = async (userId: string, newRole: 'admin' | 'user') => {
        setUpdatingRole(userId);
        try {
            const res = await fetch(`${API_BASE_URL}/api/users/${userId}/role`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: newRole }),
            });
            if (res.ok) {
                setAllUsers(prev =>
                    prev.map(u => u.id === userId ? { ...u, role: newRole } : u)
                );
                // If admin changed their own role, refresh
                if (userId === user?.id) {
                    await refreshUser();
                }
            }
        } catch (err) {
            console.error('Error updating role:', err);
        } finally {
            setUpdatingRole(null);
        }
    };

    // Delete user (admin only)
    const handleDeleteUser = async (userId: string, email: string) => {
        if (userId === user?.id) {
            alert('Voce nao pode remover sua propria conta.');
            return;
        }
        if (!confirm(`Tem certeza que deseja remover o usuario ${email}?`)) return;

        try {
            const res = await fetch(`${API_BASE_URL}/api/users/${userId}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                setAllUsers(prev => prev.filter(u => u.id !== userId));
            }
        } catch (err) {
            console.error('Error deleting user:', err);
        }
    };

    // Toggle seller status
    const handleToggleSeller = async (userId: string, currentIsSeller: boolean) => {
        setUpdatingSeller(userId);
        try {
            const newValue = !currentIsSeller;
            const res = await fetch(`${API_BASE_URL}/api/sellers/${userId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    is_seller: newValue,
                    seller_active: newValue,
                    seller_order: newValue ? (allUsers.filter(u => u.is_seller).length + 1) : null,
                }),
            });
            if (res.ok) {
                const updated = await res.json();
                setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, ...updated } : u));
                fetchRotationState();
            }
        } catch (err) {
            console.error('Error toggling seller:', err);
        } finally {
            setUpdatingSeller(null);
        }
    };

    // Toggle seller active in rotation
    const handleToggleActive = async (userId: string, currentActive: boolean) => {
        setUpdatingSeller(userId);
        try {
            const endpoint = currentActive
                ? `${API_BASE_URL}/api/sellers/${userId}/deactivate`
                : `${API_BASE_URL}/api/sellers/${userId}/activate`;
            const res = await fetch(endpoint, { method: 'POST' });
            if (res.ok) {
                const updated = await res.json();
                setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, ...updated } : u));
                fetchRotationState();
            }
        } catch (err) {
            console.error('Error toggling active:', err);
        } finally {
            setUpdatingSeller(null);
        }
    };

    // Save WhatsApp number
    const handleSaveWhatsApp = async (userId: string) => {
        const number = editingWhatsApp[userId];
        if (number === undefined) return;

        const cleaned = number.replace(/\D/g, '');
        if (cleaned && (cleaned.length < 12 || cleaned.length > 13)) {
            alert('Numero invalido. Use o formato: 5527999991234');
            return;
        }

        setUpdatingSeller(userId);
        try {
            const res = await fetch(`${API_BASE_URL}/api/sellers/${userId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ whatsapp_number: cleaned || null }),
            });
            if (res.ok) {
                const updated = await res.json();
                setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, ...updated } : u));
                setEditingWhatsApp(prev => {
                    const next = { ...prev };
                    delete next[userId];
                    return next;
                });
            }
        } catch (err) {
            console.error('Error saving whatsapp:', err);
        } finally {
            setUpdatingSeller(null);
        }
    };

    // Computed: active sellers in order
    const activeSellers = allUsers
        .filter(u => u.is_seller && u.seller_active)
        .sort((a, b) => (a.seller_order || 999) - (b.seller_order || 999));

    // Find next seller (the one AFTER current_seller_id in the rotation)
    const nextSellerId = (() => {
        if (!rotationState?.current_seller_id || activeSellers.length === 0) {
            return activeSellers[0]?.id || null;
        }
        const currentIdx = activeSellers.findIndex(s => s.id === rotationState.current_seller_id);
        if (currentIdx === -1) return activeSellers[0]?.id || null;
        const nextIdx = (currentIdx + 1) % activeSellers.length;
        return activeSellers[nextIdx]?.id || null;
    })();

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold tracking-tight text-foreground">
                    Configuracoes
                </h2>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Profile Settings */}
                <div className="rounded-xl bg-card p-6 shadow-sm border border-border">
                    <h3 className="text-lg font-medium leading-6 text-foreground mb-4">Perfil</h3>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="name">Nome</Label>
                            <Input
                                type="text"
                                id="name"
                                value={profileName}
                                onChange={(e) => setProfileName(e.target.value)}
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="email">Email</Label>
                            <Input
                                type="email"
                                id="email"
                                value={user?.email || ''}
                                disabled
                                className="mt-1"
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <Button
                                onClick={handleSaveProfile}
                                disabled={savingProfile}
                            >
                                {savingProfile ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Save className="mr-2 h-4 w-4" />
                                )}
                                Salvar
                            </Button>
                            {profileSaved && (
                                <span className="text-sm text-green-600">Salvo com sucesso!</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Role Info */}
                <div className="rounded-xl bg-card p-6 shadow-sm border border-border">
                    <h3 className="text-lg font-medium leading-6 text-foreground mb-4">Sua Conta</h3>
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                            {isAdmin ? (
                                <ShieldCheck className="h-8 w-8 text-primary" />
                            ) : (
                                <Shield className="h-8 w-8 text-muted-foreground" />
                            )}
                            <div>
                                <p className="font-medium text-foreground">
                                    {isAdmin ? 'Administrador' : 'Usuario'}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    {isAdmin
                                        ? 'Acesso total ao sistema, incluindo gestao de usuarios.'
                                        : 'Acesso a leads, conversas, agendamentos e analytics.'}
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            onClick={handleSignOut}
                            className="w-full border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20"
                        >
                            <LogOut className="h-4 w-4" />
                            Sair da conta
                        </Button>
                    </div>
                </div>
            </div>

            {/* User Management (Admin Only) */}
            {isAdmin && (
                <div className="rounded-xl bg-card p-6 shadow-sm border border-border">
                    <div className="flex items-center gap-2 mb-6">
                        <Users className="h-5 w-5 text-primary" />
                        <h3 className="text-lg font-medium leading-6 text-foreground">
                            Gestao de Usuarios e Vendedores
                        </h3>
                    </div>

                    {loadingUsers ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : allUsers.length === 0 ? (
                        <p className="text-muted-foreground text-sm py-4">
                            Nenhum usuario encontrado.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nome</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Vendedor</TableHead>
                                        <TableHead>WhatsApp</TableHead>
                                        <TableHead className="text-right">Acoes</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {allUsers.map((u) => (
                                        <TableRow key={u.id}>
                                            <TableCell className="text-foreground">
                                                {u.full_name || '—'}
                                                {u.id === user?.id && (
                                                    <span className="ml-2 text-xs text-primary font-medium">(voce)</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">{u.email}</TableCell>
                                            <TableCell>
                                                <Select
                                                    value={u.role}
                                                    onValueChange={(value) => handleRoleChange(u.id, value as 'admin' | 'user')}
                                                    disabled={updatingRole === u.id || u.id === user?.id}
                                                >
                                                    <SelectTrigger className="w-[120px]">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="admin">Admin</SelectItem>
                                                        <SelectItem value="user">Usuario</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                {updatingRole === u.id && (
                                                    <Loader2 className="inline ml-2 h-3 w-3 animate-spin text-muted-foreground" />
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <button
                                                    onClick={() => handleToggleSeller(u.id, !!u.is_seller)}
                                                    disabled={updatingSeller === u.id}
                                                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                                                        u.is_seller
                                                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-300/50 hover:bg-emerald-200'
                                                            : 'bg-muted/50 text-muted-foreground border border-border hover:bg-muted'
                                                    }`}
                                                >
                                                    <span className={`w-2 h-2 rounded-full ${
                                                        u.is_seller
                                                            ? u.seller_active ? 'bg-emerald-500' : 'bg-amber-500'
                                                            : 'bg-slate-300'
                                                    }`} />
                                                    {u.is_seller
                                                        ? u.seller_active ? 'Ativo' : 'Pausa'
                                                        : 'Nao'}
                                                    {updatingSeller === u.id && (
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                    )}
                                                </button>
                                                {u.is_seller && (
                                                    <button
                                                        onClick={() => handleToggleActive(u.id, !!u.seller_active)}
                                                        disabled={updatingSeller === u.id}
                                                        className="ml-1 text-[10px] text-muted-foreground hover:text-foreground underline"
                                                    >
                                                        {u.seller_active ? 'pausar' : 'ativar'}
                                                    </button>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {u.is_seller ? (
                                                    <div className="flex items-center gap-1">
                                                        <Input
                                                            type="text"
                                                            placeholder="5527999991234"
                                                            value={editingWhatsApp[u.id] !== undefined
                                                                ? editingWhatsApp[u.id]
                                                                : u.whatsapp_number || ''}
                                                            onChange={(e) => setEditingWhatsApp(prev => ({
                                                                ...prev,
                                                                [u.id]: e.target.value.replace(/\D/g, '')
                                                            }))}
                                                            onBlur={() => {
                                                                if (editingWhatsApp[u.id] !== undefined) {
                                                                    handleSaveWhatsApp(u.id);
                                                                }
                                                            }}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') handleSaveWhatsApp(u.id);
                                                            }}
                                                            className="w-[140px] h-8 text-xs"
                                                        />
                                                        {u.whatsapp_number && (
                                                            <PhoneLottieIcon size={18} className="flex-shrink-0" />
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground text-xs">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {u.id !== user?.id && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleDeleteUser(u.id, u.email)}
                                                        className="text-destructive hover:text-destructive/80 hover:bg-destructive/10"
                                                        title="Remover usuario"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>
            )}

            {/* Fila de Distribuicao (Admin Only) */}
            {isAdmin && (
                <div className="rounded-xl bg-card p-6 shadow-sm border border-border">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium leading-6 text-foreground">
                            Fila de Distribuicao
                        </h3>
                        {rotationState && (
                            <span className="text-xs text-muted-foreground">
                                Total atribuidos: {rotationState.total_assignments}
                            </span>
                        )}
                    </div>

                    {activeSellers.length === 0 ? (
                        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
                            <span className="text-amber-600 text-sm">
                                Nenhum vendedor ativo. Leads sendo enviados para o gerente (numero fixo).
                            </span>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Seller pills */}
                            <div className="flex flex-wrap gap-3">
                                {activeSellers.map((seller, idx) => {
                                    const isNext = seller.id === nextSellerId;
                                    const initials = (seller.full_name || 'V')
                                        .split(' ')
                                        .map(n => n[0])
                                        .join('')
                                        .slice(0, 2)
                                        .toUpperCase();

                                    return (
                                        <div
                                            key={seller.id}
                                            className={`relative flex flex-col items-center gap-1 p-3 rounded-xl min-w-[80px] transition-colors ${
                                                isNext
                                                    ? 'bg-emerald-100 border-2 border-emerald-400'
                                                    : 'bg-white/60 border border-border'
                                            }`}
                                        >
                                            {isNext && (
                                                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 text-[9px] font-bold bg-emerald-500 text-white rounded-full whitespace-nowrap">
                                                    Proximo
                                                </span>
                                            )}
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                                                {initials}
                                            </div>
                                            <span className="text-[11px] font-medium text-foreground text-center leading-tight">
                                                {seller.full_name?.split(' ')[0] || 'Vendedor'}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground">
                                                #{seller.seller_order || idx + 1}
                                            </span>
                                            {!seller.whatsapp_number && (
                                                <span className="text-[9px] text-amber-600">Sem WhatsApp</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Flow visualization */}
                            <div className="flex items-center gap-1 text-muted-foreground text-xs">
                                {activeSellers.map((s, i) => (
                                    <span key={s.id} className="flex items-center gap-1">
                                        <span className={s.id === nextSellerId ? 'font-bold text-emerald-600' : ''}>
                                            {s.full_name?.split(' ')[0]}
                                        </span>
                                        {i < activeSellers.length - 1 && <ArrowRight className="h-3 w-3" />}
                                    </span>
                                ))}
                                {activeSellers.length > 1 && (
                                    <span className="flex items-center gap-1">
                                        <ArrowRight className="h-3 w-3" />
                                        <span className="text-muted-foreground/50">(repete)</span>
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

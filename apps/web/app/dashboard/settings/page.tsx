
'use client';

import { useEffect, useState, useCallback } from 'react';
import { Save, Users, Shield, ShieldCheck, Trash2, Loader2, LogOut } from 'lucide-react';
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

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

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
                            Gestao de Usuarios
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
        </div>
    );
}

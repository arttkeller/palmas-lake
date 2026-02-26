import { SquareKanbanIcon } from '@/components/icons/square-kanban';
import { MessageCircleMoreIcon } from '@/components/icons/message-circle-more';
import { UsersIcon } from '@/components/icons/users';
import { CalendarDaysIcon } from '@/components/icons/calendar-days';
import { ChartColumnIcon } from '@/components/icons/chart-column';
import { SettingsIcon } from '@/components/icons/settings';
import { BellIcon } from '@/components/icons/bell';

/**
 * Navigation item interface for the bottom navigation bar
 */
export interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  gradient: string;
  iconColor: string;
  activeIconColor: string;
}

/**
 * Navigation items configuration for the Palmas Lake CRM dashboard
 * Contains 6 main sections: Quadro, Conversas, Leads, Agendamentos, Análise, Configurações
 */
export const navigationItems: NavItem[] = [
  { 
    name: 'quadro', 
    href: '/dashboard/quadro', 
    icon: SquareKanbanIcon, 
    label: 'Quadro',
    gradient: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, rgba(37,99,235,0.06) 50%, rgba(29,78,216,0) 100%)',
    iconColor: 'group-hover:text-blue-500:text-blue-400',
    activeIconColor: 'text-blue-500'
  },
  { 
    name: 'chat', 
    href: '/dashboard/chat', 
    icon: MessageCircleMoreIcon, 
    label: 'Conversas',
    gradient: 'radial-gradient(circle, rgba(147,51,234,0.15) 0%, rgba(126,34,206,0.06) 50%, rgba(88,28,135,0) 100%)',
    iconColor: 'group-hover:text-purple-500:text-purple-400',
    activeIconColor: 'text-purple-500'
  },
  { 
    name: 'leads', 
    href: '/dashboard/leads', 
    icon: UsersIcon, 
    label: 'Leads',
    gradient: 'radial-gradient(circle, rgba(34,197,94,0.15) 0%, rgba(22,163,74,0.06) 50%, rgba(21,128,61,0) 100%)',
    iconColor: 'group-hover:text-green-500:text-green-400',
    activeIconColor: 'text-green-500'
  },
  { 
    name: 'agendamentos', 
    href: '/dashboard/agendamentos', 
    icon: CalendarDaysIcon, 
    label: 'Agendamentos',
    gradient: 'radial-gradient(circle, rgba(249,115,22,0.15) 0%, rgba(234,88,12,0.06) 50%, rgba(194,65,12,0) 100%)',
    iconColor: 'group-hover:text-orange-500:text-orange-400',
    activeIconColor: 'text-orange-500'
  },
  { 
    name: 'analytics', 
    href: '/dashboard/analytics', 
    icon: ChartColumnIcon, 
    label: 'Análise',
    gradient: 'radial-gradient(circle, rgba(20,184,166,0.15) 0%, rgba(13,148,136,0.06) 50%, rgba(15,118,110,0) 100%)',
    iconColor: 'group-hover:text-teal-500:text-teal-400',
    activeIconColor: 'text-teal-500'
  },
  {
    name: 'notificacoes',
    href: '/dashboard/notificacoes',
    icon: BellIcon,
    label: 'Alertas',
    gradient: 'radial-gradient(circle, rgba(234,179,8,0.15) 0%, rgba(202,138,4,0.06) 50%, rgba(161,98,7,0) 100%)',
    iconColor: 'group-hover:text-yellow-500:text-yellow-400',
    activeIconColor: 'text-yellow-500'
  },
  {
    name: 'settings',
    href: '/dashboard/settings',
    icon: SettingsIcon,
    label: 'Configurações',
    gradient: 'radial-gradient(circle, rgba(239,68,68,0.15) 0%, rgba(220,38,38,0.06) 50%, rgba(185,28,28,0) 100%)',
    iconColor: 'group-hover:text-red-500:text-red-400',
    activeIconColor: 'text-red-500'
  },
];

/**
 * Get navigation item by name
 */
export function getNavItemByName(name: string): NavItem | undefined {
  return navigationItems.find(item => item.name === name);
}

/**
 * Get navigation item by href
 */
export function getNavItemByHref(href: string): NavItem | undefined {
  return navigationItems.find(item => item.href === href);
}

/**
 * Check if a path matches a navigation item
 */
export function isNavItemActive(itemHref: string, currentPath: string): boolean {
  return currentPath === itemHref || currentPath.startsWith(itemHref + '/');
}

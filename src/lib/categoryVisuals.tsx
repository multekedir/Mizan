import { Heart, BookOpen, Moon, Users, Home, Dumbbell, Calendar, Target } from 'lucide-react';
import type { CategoryKey, CategoryOption } from './categories';

export const CATEGORIES: CategoryOption[] = [
  { key: 'iman',      label: 'Iman',      icon: <Heart className="w-5 h-5" />,    color: 'text-rose-600 bg-rose-100' },
  { key: 'quran',     label: 'Quran',     icon: <BookOpen className="w-5 h-5" />, color: 'text-amber-600 bg-amber-100' },
  { key: 'prayer',    label: 'Prayer',    icon: <Moon className="w-5 h-5" />,     color: 'text-indigo-600 bg-indigo-100' },
  { key: 'parenting', label: 'Parenting', icon: <Users className="w-5 h-5" />,    color: 'text-sky-600 bg-sky-100' },
  { key: 'home',      label: 'Home',      icon: <Home className="w-5 h-5" />,     color: 'text-orange-600 bg-orange-100' },
  { key: 'fitness',   label: 'Fitness',   icon: <Dumbbell className="w-5 h-5" />, color: 'text-lime-600 bg-lime-100' },
  { key: 'spiritual', label: 'Spiritual', icon: <Heart className="w-5 h-5" />,    color: 'text-violet-600 bg-violet-100' },
  { key: 'fasting',   label: 'Fasting',   icon: <Moon className="w-5 h-5" />,     color: 'text-purple-600 bg-purple-100' },
  { key: 'review',    label: 'Review',    icon: <Calendar className="w-5 h-5" />, color: 'text-neutral-600 bg-neutral-100' },
  { key: 'default',   label: 'Other',     icon: <Target className="w-5 h-5" />,   color: 'text-mizan-text bg-mizan-surfaceSoft' },
];

const _BY_KEY = new Map<CategoryKey, CategoryOption>(CATEGORIES.map((c) => [c.key, c]));

export function getCategoryVisual(key: CategoryKey): CategoryOption {
  return _BY_KEY.get(key) ?? CATEGORIES[CATEGORIES.length - 1]!;
}

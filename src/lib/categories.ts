import {
  Zap,
  Wrench,
  Hammer,
  Baby,
  ChefHat,
  Flower2,
  Sparkles,
  Ruler,
  Paintbrush,
  Car,
  Shield,
  Briefcase,
  Boxes,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";

export interface Category {
  name: string;
  icon: LucideIcon;
}

export const CATEGORIES: Category[] = [
  { name: "Electricista", icon: Zap },
  { name: "Gasfitero", icon: Wrench },
  { name: "Albañil", icon: Hammer },
  { name: "Niñera", icon: Baby },
  { name: "Cocinero/a", icon: ChefHat },
  { name: "Jardinero", icon: Flower2 },
  { name: "Limpieza", icon: Sparkles },
  { name: "Carpintero", icon: Ruler },
  { name: "Pintor", icon: Paintbrush },
  { name: "Chofer", icon: Car },
  { name: "Seguridad", icon: Shield },
  { name: "Administrativo", icon: Briefcase },
  { name: "Logística y almacén", icon: Boxes },
  { name: "Otro", icon: LayoutGrid },
];

export const CATEGORY_NAMES = CATEGORIES.map((c) => c.name);

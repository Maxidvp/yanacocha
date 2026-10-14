// Diccionario de textos de interfaz (es → en). La clave es el texto en español tal como aparece en t().
import { UI_APP } from './textos/app';
import { UI_CONFIG } from './textos/config';
import { UI_RESUMEN } from './textos/resumen';
import { UI_FILTROS } from './textos/filtros';
import { UI_VARIOS } from './textos/varios';

export const UI_EN: Record<string, string> = { ...UI_VARIOS, ...UI_FILTROS, ...UI_RESUMEN, ...UI_CONFIG, ...UI_APP };

export type BrandingConfig = {
  company_name: string;
  department_name: string;
  powered_by: string;
  login_title: string;
  login_subtitle: string;
  login_description: string;
  primary_color: string;
  accent_color: string;
  sidebar_logo_url: string;
  login_logo_url: string;
  favicon_url: string;
};

export const defaultBranding: BrandingConfig = {
  company_name: "MKNG Soluções",
  department_name: "Setor de Comunicação Visual",
  powered_by: "SER Comunicação Inteligente & Hakham IA",
  login_title: "Setor de Comunicação Visual",
  login_subtitle: "MKNG Soluções",
  login_description: "Sistema interno para controlar demandas, pedidos, produção, chapas, tintas, compras, consumo de materiais e resultados.",
  primary_color: "#ff6a00",
  accent_color: "#8a4dff",
  sidebar_logo_url: "/mkng-logo.svg",
  login_logo_url: "",
  favicon_url: "/favicon.svg",
};

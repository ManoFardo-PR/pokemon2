export const strings = {
  brand: "PokéSearch",
  nav: {
    search: "Buscar",
    decks: "Decks",
    meta: "Meta",
    sim: "Simulador",
    rules: "Regras",
    sets: "Sets",
  },
  health: {
    connected: "Conectado",
    unavailable: "Banco indisponível",
    retry: "Tentar novamente",
    loading: "Verificando...",
  },
  loading: "Carregando...",
  errors: {
    generic: "Algo deu errado.",
    byCode: {
      not_found: "Não encontrado.",
      validation_error: "Parâmetros inválidos.",
      database_unavailable: "O banco de dados não está acessível.",
      schema_outdated: "O banco está desatualizado. Rode as migrações.",
      invalid_response: "Resposta inesperada da API.",
      network_error: "Falha de rede ao conectar com a API.",
    } as Record<string, string>,
  },
  footer: {
    dataSources: "Dados: pokemon-tcg-data, TCGdex, Limitless.",
    disclaimer: "Não afiliado à Nintendo / The Pokémon Company.",
  },
  notFound: {
    title: "Não encontrado",
    message: "A página solicitada não foi encontrada.",
    backToHome: "Voltar para Buscar",
  },
  retry: "Tentar novamente",
} as const;

export function errorMessage(code: string | undefined): string {
  if (!code) return strings.errors.generic;
  return strings.errors.byCode[code] || strings.errors.generic;
}

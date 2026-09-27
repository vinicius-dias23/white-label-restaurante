import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Os testes de integração compartilham o mesmo banco: rodando em paralelo,
    // um apaga as tabelas enquanto o outro está usando. A suíte é rápida o
    // suficiente para não valer a pena separar por schema.
    fileParallelism: false,
    include: ['src/**/*.test.ts'],
    testTimeout: 20_000,
  },
})

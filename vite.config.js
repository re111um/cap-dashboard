import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/cap-dashboard/',  // GitHub repo 이름과 일치시켜야 함
})

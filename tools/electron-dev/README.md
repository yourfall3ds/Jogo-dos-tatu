# TransFPS — Launcher Electron de DEV

App nativo pra **jogar/testar localmente** sem os problemas do navegador.

## Por que existe

No Chrome, jogar o TransFPS tinha vários problemas:
- **Ctrl+W** (andar pra frente + agachar) **fechava o navegador**.
- O **mouse escapava da tela** mesmo "travado" — você clicava em coisas do Windows enquanto mirava.
- **ESC** soltava o pointer lock de forma traiçoeira.
- Logs presos no DevTools, difícil de ler/copiar.

Este Electron resolve tudo:
- ✅ **Pointer lock REAL** — mouse 100% no jogo, não sai da tela.
- ✅ **Ctrl+W / F5 / Ctrl+R / Ctrl+Q… BLOQUEADOS** durante o jogo (não fecham nem recarregam).
- ✅ **ESC** chega limpo no jogo (o jogo decide o pause).
- ✅ **Logs no terminal** — todo `console.log`/erro do jogo é cuspido colorido no terminal onde você rodou.

## Como rodar

```bash
cd tools/electron-dev
npm install        # primeira vez (baixa o Electron)
npm start          # abre o jogo de PRODUÇÃO (app.overpixel.online/transfps)
```

Variações:
```bash
npm run local      # carrega http://localhost:5500 (servidor local)
TRANSFPS_URL=http://localhost:8080/ npm start   # url custom
```

## Atalhos (dentro do app)

| Tecla | Ação |
|-------|------|
| `F12` | abre/fecha DevTools |
| `Ctrl+Shift+R` | recarrega DE PROPÓSITO (o reload acidental está bloqueado) |
| `F11` | fullscreen |
| `ESC` | repassado pro jogo (pausa) |
| `Ctrl+W`, `F5`, `Ctrl+R`, `Ctrl+Q`… | **bloqueados** (não fazem nada) |

Pra fechar: barra de título (X) ou `Alt+F4`.

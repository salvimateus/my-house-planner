import { ExternalLink, ShieldCheck } from 'lucide-react';
import type { ReactElement } from 'react';
import { uiStore, useUi } from '../../store/uiStore.ts';
import { Dialog } from '../controls/Dialog.tsx';
import { Logo } from '../screens/Logo.tsx';
import { SHORTCUT_LIST } from '../shortcuts.ts';
import './AboutDialog.css';

const REPO_URL = 'https://github.com/salvimateus/my-house-planner';
const AUTHOR_URL = 'https://github.com/salvimateus';

export function AboutDialog(): ReactElement {
  const open = useUi((s) => s.dialog === 'about');
  return (
    <Dialog open={open} onClose={uiStore.getState().closeDialog} title="Sobre o Casinha">
      <div className="about">
        <div className="about-hero">
          <Logo size={52} />
          <div>
            <p className="about-name">Casinha</p>
            <p className="about-tag">Desenhe a planta da sua casa, sem ser arquiteto.</p>
          </div>
        </div>

        <p className="about-privacy">
          <ShieldCheck aria-hidden="true" />
          <span>
            Tudo fica neste navegador. Não tem cadastro, não tem servidor e nada é enviado sem você
            mandar.
          </span>
        </p>

        <section className="about-section" aria-labelledby="about-howto">
          <h3 id="about-howto" className="about-h3">
            Como usar
          </h3>
          <ul className="about-list">
            <li>Arraste no terreno para desenhar um cômodo. As paredes aparecem sozinhas.</li>
            <li>Toque num cômodo, numa parede ou num objeto para mudar as medidas.</li>
            <li>Use dois dedos para mover e dar zoom na planta.</li>
            <li>Pelo menu, salve um arquivo ou exporte um PDF para mandar a um profissional.</li>
          </ul>
        </section>

        <section className="about-section" aria-labelledby="about-keys">
          <h3 id="about-keys" className="about-h3">
            Atalhos de teclado
          </h3>
          <dl className="about-keys">
            {SHORTCUT_LIST.map((s) => (
              <div key={s.keys} className="about-key-row">
                <dt>
                  <kbd>{s.keys}</kbd>
                </dt>
                <dd>{s.label}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="about-disclaimer">
          O Casinha serve para estudar ideias. As medidas e áreas são aproximadas: valide o projeto
          com um(a) arquiteto(a) ou engenheiro(a) antes de construir.
        </p>

        <p className="about-foot">
          <a className="about-link" href={REPO_URL} target="_blank" rel="noopener noreferrer">
            Ver o código no GitHub
            <ExternalLink aria-hidden="true" />
            <span className="sr-only"> (abre em outra aba)</span>
          </a>
        </p>

        <footer className="about-credits" lang="en">
          <p>Made by Mateus Salvi</p>
          <p>
            <a
              className="about-credits-link"
              href={AUTHOR_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              @salvimateus on GitHub
              <span className="sr-only" lang="pt-BR">
                {' '}
                (abre em outra aba)
              </span>
            </a>
          </p>
          <p className="about-credits-license">MIT license.</p>
        </footer>
      </div>
    </Dialog>
  );
}

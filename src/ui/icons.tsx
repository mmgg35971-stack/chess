import home from '../assets/icons/icon_home.svg?raw';
import puzzle from '../assets/icons/icon_puzzle.svg?raw';
import person from '../assets/icons/icon_person.svg?raw';
import book from '../assets/icons/icon_book.svg?raw';
import settings from '../assets/icons/icon_settings.svg?raw';
import play from '../assets/icons/icon_play.svg?raw';
import trophy from '../assets/icons/icon_trophy.svg?raw';
import analysis from '../assets/icons/icon_analysis.svg?raw';

const icons = { home, puzzle, person, book, settings, play, trophy, analysis };
export type IconName = keyof typeof icons;

/** Inline the pack's stroke icons so they follow the text colour (currentColor). */
export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <span
      className="icon"
      style={{ width: size, height: size }}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: icons[name] }}
    />
  );
}

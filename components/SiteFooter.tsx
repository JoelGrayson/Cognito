const PEOPLE = [
  { name: "Angela", href: "https://angelafelicia.com" },
  { name: "Evan", href: "https://evanyu.dev" },
  { name: "Joel", href: "https://www.linkedin.com/in/joelgrayson/" },
  { name: "Uijin", href: "https://uijincho.com" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-(--wb-line) px-5 py-6 text-center text-sm text-(--wb-muted) sm:px-8">
      Created by{" "}
      {PEOPLE.map((person, i) => (
        <span key={person.name}>
          {i === PEOPLE.length - 1 && " & "}
          <a
            href={person.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-(--wb-line) underline-offset-2 transition-colors hover:text-foreground"
          >
            {person.name}
          </a>
          {i < PEOPLE.length - 2 && ", "}
        </span>
      ))}{" "}
      at{" "}
      <a
        href="https://github.com/JoelGrayson/Cognito"
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-(--wb-line) underline-offset-2 transition-colors hover:text-foreground"
      >
        HackMIT 2026
      </a>
    </footer>
  );
}

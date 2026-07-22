import { ContactForm } from "./contact-form";

export function Cta() {
  return (
    <section
      id="contact"
      className="scroll-mt-20 border-t border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="mx-auto max-w-6xl px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
            Pronto para simplificar sua logística?
          </h2>
          <p className="mt-4 text-zinc-600 dark:text-zinc-400">
            Fale com a gente ou crie sua conta agora mesmo.
          </p>
        </div>

        <div className="mt-10">
          <ContactForm />
        </div>
      </div>
    </section>
  );
}

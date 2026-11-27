import { Container } from '@/shared/ui/container';

export default function BrandNotFound() {
  return (
    <Container className="max-w-xl py-24">
      <h1 className="font-display text-4xl font-semibold">Проект не найден</h1>
      <p className="mt-4 leading-relaxed text-muted">
        Проверьте, что ссылка скопирована полностью. Если вы потеряли ссылку на свой проект, напишите нам в WhatsApp — мы
        найдём его по номеру телефона.
      </p>
    </Container>
  );
}

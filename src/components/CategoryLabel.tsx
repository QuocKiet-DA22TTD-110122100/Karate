interface CategoryLabelProps {
  text: string;
  className?: string;
}

export default function CategoryLabel({ text, className }: CategoryLabelProps) {
  return (
    <div className={`max-w-xs text-right text-xl leading-tight text-white ${className ?? ''}`}>
      {text}
    </div>
  );
}

import { type ReactNode, useId } from "react";

export interface FieldControlProps {
  id: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
}

/**
 * A labelled form field. An error shows under the control, saying why it
 * can't be saved; it describes the field without becoming part of its name.
 */
export function Field({
  label,
  error,
  className,
  children,
}: {
  label: ReactNode;
  error?: string | false;
  className?: string;
  children(control: FieldControlProps): ReactNode;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div
      className={
        className ? `draft-recipe-field ${className}` : "draft-recipe-field"
      }
    >
      <label htmlFor={id}>{label}</label>
      {children(
        error
          ? { id, "aria-invalid": true, "aria-describedby": errorId }
          : { id },
      )}
      {error && (
        <small id={errorId} className="draft-recipe-field-error">
          {error}
        </small>
      )}
    </div>
  );
}

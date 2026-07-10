import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateTaskDto {
  /** The question or topic to explain. */
  @IsString()
  @MinLength(1)
  question!: string;

  /** Optional extra context (e.g. uploaded material). */
  @IsOptional()
  @IsString()
  context?: string;
}

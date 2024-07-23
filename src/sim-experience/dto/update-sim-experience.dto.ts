import { PartialType } from '@nestjs/mapped-types';
import { CreateSimExperienceDto } from './create-sim-experience.dto';

export class UpdateSimExperienceDto extends PartialType(CreateSimExperienceDto) {}

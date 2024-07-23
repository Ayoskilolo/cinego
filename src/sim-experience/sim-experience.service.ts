import { Injectable } from '@nestjs/common';
import { CreateSimExperienceDto } from './dto/create-sim-experience.dto';
import { UpdateSimExperienceDto } from './dto/update-sim-experience.dto';

@Injectable()
export class SimExperienceService {
  create(createSimExperienceDto: CreateSimExperienceDto) {
    return 'This action adds a new simExperience';
  }

  findAll() {
    return `This action returns all simExperience`;
  }

  findOne(id: number) {
    return `This action returns a #${id} simExperience`;
  }

  update(id: number, updateSimExperienceDto: UpdateSimExperienceDto) {
    return `This action updates a #${id} simExperience`;
  }

  remove(id: number) {
    return `This action removes a #${id} simExperience`;
  }
}

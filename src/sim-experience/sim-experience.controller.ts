import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { SimExperienceService } from './sim-experience.service';
import { CreateSimExperienceDto } from './dto/create-sim-experience.dto';
import { UpdateSimExperienceDto } from './dto/update-sim-experience.dto';

@Controller('sim-experience')
export class SimExperienceController {
  constructor(private readonly simExperienceService: SimExperienceService) {}

  @Post()
  create(@Body() createSimExperienceDto: CreateSimExperienceDto) {
    return this.simExperienceService.create(createSimExperienceDto);
  }

  @Get()
  findAll() {
    return this.simExperienceService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.simExperienceService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateSimExperienceDto: UpdateSimExperienceDto) {
    return this.simExperienceService.update(+id, updateSimExperienceDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.simExperienceService.remove(+id);
  }
}

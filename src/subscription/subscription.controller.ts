import { Controller } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';

@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  // @Post()
  // create(@Body() createSubscriptionDto: CreateSubscriptionDto) {
  //   return this.subscriptionService.create(createSubscriptionDto);
  // }

  // @Get('type')
  // findAll() {
  //   const data = this.subscriptionService.returnAllSubscriptionTypes();
  //   return { data };
  // }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.subscriptionService.findOne(+id);
  // }

  // @Patch(':id')
  // update(
  //   @Param('id') id: string,
  //   @Body() updateSubscriptionDto: UpdateSubscriptionDto,
  // ) {
  //   return this.subscriptionService.update(+id, updateSubscriptionDto);
  // }
}

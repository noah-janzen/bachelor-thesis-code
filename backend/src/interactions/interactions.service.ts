import { Model } from 'mongoose';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { AddInteractionDto } from './dto/add-interaction.dto';
import { Interaction, InteractionDocument } from './interaction.model';

@Injectable()
export class InteractionsService {
  constructor(
    @InjectModel(Interaction.name)
    private interactionModel: Model<InteractionDocument>,
  ) {}

  async addInteraction({
    userId,
    newsArticleId,
    clicked,
  }: {
    userId: string;
    newsArticleId: string;
    clicked: boolean;
  }) {
    const existingInteraction = await this.interactionModel.findOne({
      $and: [{ user: userId }, { newsArticleId: newsArticleId }],
    });

    if (existingInteraction) {
      existingInteraction.lastInteraction = new Date();
      existingInteraction.clicked = existingInteraction.clicked || clicked;
      return await existingInteraction.save();
    }

    const newInteraction = await new this.interactionModel({
      user: userId,
      newsArticleId: newsArticleId,
      clicked: clicked,
    });
    return await newInteraction.save();
  }

  async getInteractions({ userId }: { userId: string }) {
    return this.interactionModel.find({ user: userId });
  }
}

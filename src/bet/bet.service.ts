import { SettingDocument } from './../setting/schema/setting.schema';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CreateBetDto } from './dto/create-bet.dto';
import { UpdateBetDto } from './dto/update-bet.dto';
import { InjectModel } from '@nestjs/mongoose';
import { ModelName } from '../helpers';
import { Model } from 'mongoose';
import { Bet, BetDocument } from './schema/bet.schema';
import { BetStatus } from '../helpers/enums';
import { TotalAmount } from './types/total-amount';
import { GetUsersStatus } from '../helpers/enums/get-users-status.enum';
import { UserDocument } from '../user/user.schema';

@Injectable()
export class BetService {
  constructor(
    @InjectModel(ModelName.BET) private readonly betModel: Model<BetDocument>,
    @InjectModel(ModelName.SETTING)
    private readonly settingModel: Model<SettingDocument>,
    @InjectModel(ModelName.USER)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async create(userId: string, createBetDto: CreateBetDto): Promise<Bet> {
    const setting = (await this.settingModel.find())[0];
    const bet = {
      ...createBetDto,
      balance_amount: createBetDto.bet_amount * setting.factor,
      available_amount: createBetDto.bet_amount * setting.factor * 0.75,
      retained_amount: createBetDto.bet_amount * setting.factor * 0.25,
      active_duration: setting.timeOfBet,
      payment_reference: 'uiu234ewrdsffsde',
      factor: setting.factor,
    };

    const newBet = new this.betModel({
      ...bet,
      user: userId,
    });

    await this.userModel.findByIdAndUpdate(userId, { $push: { bets: newBet } });

    return (await newBet.save()).populate(['user']);
  }

  async findAll(userId: string) {
    return this.betModel.find({ user: userId }).populate(['user']);
  }

  async findCurrentBet(userId): Promise<Bet | null> {
    const currentBet = await this.betModel
      .find({ user: userId, status: BetStatus.IN_PROGRESS })
      .sort('-createdAt')
      .limit(1);

    if (!currentBet[0]) {
      throw new HttpException(
        "Vous n'avez pas de mise en cours",
        HttpStatus.UNAUTHORIZED,
      );
    }
    return (await currentBet[0].populate(['user']))['_doc'];
  }

  update(betId: string, updateBetDto: UpdateBetDto) {
    return this.betModel.findByIdAndUpdate(
      betId,
      { $set: { ...updateBetDto } },
      { new: true, upsert: true },
    );
  }

  async checkExistingBet(userId: string) {
    const verifyExistingBet = await this.betModel
      .findOne({ user: userId })
      .where({ status: BetStatus.IN_PROGRESS });
    console.log(verifyExistingBet);
    if (verifyExistingBet) {
      throw new HttpException(
        'Il existe deja une mise en cours',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return {
      msg: 'done',
      status: 200,
    };
  }

  async getTotalBetItems() {
    const allBets: any = await this.betModel.find();
    return allBets.length;
  }

  async getBets(pageIndex: number, pageSize: number, status: string) {
    const skip = pageSize * ((pageIndex || 1) - 1);
    const limit = pageSize || 25;
    const foundCollections = [];

    const collections = await this.betModel
      .find()
      .skip(skip)
      .limit(limit)
      .sort('-createdAt');

    for (const col of collections) {
      foundCollections.push((await col.populate(['user']))['_doc']);
    }

    const totalItems: number = (await this.betModel.find()).length;

    if (status !== undefined)
      switch (status) {
        case GetUsersStatus.ALL:
          return {
            data: foundCollections,
            pagination: {
              index: pageIndex,
              size: foundCollections.length,
              total: totalItems,
            },
          };
        case GetUsersStatus.IN_LINE:
          let users = [];
          users = await this.betModel
            .find()
            .where('status')
            .equals(BetStatus.IN_PROGRESS);
          return users;
        default:
          return this.betModel.find();
      }
    else {
      return this.betModel.find();
    }
  }

  async getAllTotalOfBet(): Promise<TotalAmount> {
    const allBets: any = await this.betModel.find();

    const total: TotalAmount = {
      available: 0,
      retained: 0,
      balance: 0,
      bet: 0,
      lastBetAmount: 0,
    };

    for (const bet of allBets) {
      total.available += bet?.available_amount;
      total.retained += bet?.retained_amount;
      total.balance += bet?.balance_amount;
      total.bet += bet?.bet_amount;
    }
    total.lastBetAmount = allBets[allBets.length - 1].bet_amount;

    return total;
  }

  async getAllTotalOfBetOfUser(userId: string) {
    const allBets: any = await this.betModel.find({ user: userId });

    const total: TotalAmount = {
      available: 0,
      retained: 0,
      balance: 0,
      bet: 0,
    };

    for (const bet of allBets) {
      total.available += bet?.available_amount;
      total.retained += bet?.retained_amount;
      total.balance += bet?.balance_amount;
      total.bet += bet?.bet_amount;
    }
    total.gains = total.available - total.bet;
    return total;
  }

  async getUserBetInfor(userId: string) {
    const bets = await this.betModel.find({ user: userId });
    const user = await this.userModel.findById(userId);
    const totals = await this.getAllTotalOfBetOfUser(userId);
    return {
      ...totals,
      lastBet: bets[bets.length - 1],
      totalBets: bets.length,
      username: user.first_name,
    };
  }
}

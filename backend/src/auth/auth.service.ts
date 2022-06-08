import * as argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { CreateUserDto, LoginUserDto } from './dto';
import { MailService } from 'src/mail/mail.service';
import { UsersService } from 'src/users/users.service';
import { DateUtil } from 'src/common/util/date-util';
import { User, UserDocument } from 'src/users/user.model';
import { Tokens } from './types';

@Injectable()
export class AuthService {
  constructor(
    private configService: ConfigService,
    private mailService: MailService,
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  /**
   * Creates a new user, stores the user with the hashed password in the database and sends a confirmation link via email.
   * @param createUserDto user to sign up
   */
  async signUp(createUserDto: CreateUserDto) {
    const hashedPassword = await argon2.hash(createUserDto.password);
    const confirmationToken = uuidv4();

    let newUser;
    try {
      newUser = await this.usersService.create({
        ...createUserDto,
        password: hashedPassword,
        confirmationToken,
      });
    } catch (error) {
      if (this.emailAlreadyRegistered(error)) {
        throw new BadRequestException(
          'This email address has already been registered.',
        );
      }
      throw error;
    }

    this.mailService.sendUserConfirmation(newUser);

    return newUser;
  }

  /**
   * Confirms an user account if
   * - the passed user id belongs to a user in the database,
   * - the user has not already been confirmed,
   * - the passed token matches the registrationToken of the given user,
   * - the registration period is not expired
   * @param userId userId of the user to confirm
   * @param token registration token of the user to confirm
   */
  async confirm(userId: string, token: string) {
    let user;
    try {
      user = await this.usersService.findById(userId);
    } catch (error) {
      throw new BadRequestException('UserId invalid');
    }

    if (!user) {
      throw new BadRequestException('Could not find user');
    }

    if (user.isConfirmed) {
      throw new BadRequestException('User already confirmed');
    }

    if (user.confirmationToken !== token) {
      throw new BadRequestException('Token invalid');
    }

    if (this.isRegistrationPeriodExpired(user.confirmationTokenTimestamp)) {
      throw new BadRequestException('Registration link expired');
    }

    await this.usersService.confirm(userId);
  }

  async resendConfirmationLink(loginUserDto: LoginUserDto) {
    const user = await this.validateCredentials(
      loginUserDto.email,
      loginUserDto.password,
    );

    if (user.isConfirmed) {
      throw new BadRequestException('User already confirmed.');
    }

    const newConfirmationToken = uuidv4();
    user.confirmationToken = newConfirmationToken;
    await user.save();

    await this.mailService.sendUserConfirmation(user);
  }

  async signIn(loginUserDto: LoginUserDto): Promise<Tokens> {
    const user = await this.validateUser(
      loginUserDto.email,
      loginUserDto.password,
    );

    const tokens = await this.getTokens(user);
    const hashedRefreshToken = await argon2.hash(tokens.refresh_token);
    await this.usersService.updateRefreshToken(user, hashedRefreshToken);

    return tokens;
  }

  async logout(userId: string) {
    const user = await this.usersService.findById(userId);
    await this.usersService.deleteRefreshToken(user);
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.usersService.findById(userId);

    if (!user || !user.refreshToken)
      throw new UnauthorizedException('Access Denied');

    const requestTokenCorrect = await argon2.verify(
      user.refreshToken,
      refreshToken,
    );

    if (!requestTokenCorrect) {
      await this.usersService.deleteRefreshToken(user);
      throw new UnauthorizedException('Access Denied');
    }

    const newTokens = await this.getTokens(user);
    const hashedRefreshToken = await argon2.hash(newTokens.refresh_token);
    await this.usersService.updateRefreshToken(user, hashedRefreshToken);

    return newTokens;
  }

  /**
   * Helper method that checks whether the confirmation token timestamp is not expired
   * @param confirmationTokenTimestamp timestamp of the token creation
   * @returns true iff the timestamp is not expired
   */
  private isRegistrationPeriodExpired(confirmationTokenTimestamp) {
    const registrationDate = new Date(confirmationTokenTimestamp.toString());
    const CONFIRMATION_PERIOD_IN_HOURS = this.configService.get<number>(
      'CONFIRMATION_PERIOD_IN_HOURS',
    );
    return !DateUtil.isInRange(registrationDate, CONFIRMATION_PERIOD_IN_HOURS);
  }

  private async getTokens(user: User): Promise<Tokens> {
    const jwtPayload = {
      sub: user.id,
      email: user.email,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(jwtPayload, {
        secret: 'at-secret',
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(jwtPayload, {
        secret: 'rt-secret',
        expiresIn: '7d',
      }),
    ]);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }

  private async validateUser(
    email: string,
    password: string,
  ): Promise<UserDocument> {
    const user = await this.validateCredentials(email, password);

    if (!user.isConfirmed) {
      throw new ForbiddenException('User not confirmed.');
    }

    return user;
  }

  private async validateCredentials(
    email: string,
    password: string,
  ): Promise<UserDocument> {
    const user = await this.usersService.findOne(email);
    const passwordCorrect = await argon2.verify(user.password, password);

    if (!user || !passwordCorrect) {
      throw new ForbiddenException('Username or password invalid.');
    }

    return user;
  }

  private emailAlreadyRegistered(error) {
    return error.code === 11000 && error.keyPattern.email === 1;
  }
}
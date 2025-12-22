import { UseEnv } from '@common/config/use-env.decorator';

describe('"Use-env" decorator', () => {
  it('Should create property from specified env', () => {
    process.env.PASSWORD = 'dummy';

    class Config {
      @UseEnv('PASSWORD')
      public readonly password: string;
    }

    const config = new Config();

    expect(config.password).toBe(process.env.PASSWORD);
  });

  it('Should apply transformed for env variable, if provided', () => {
    process.env.TOKEN_TTL_SEC = '3600';

    class Config {
      @UseEnv('TOKEN_TTL_SEC', parseInt)
      public readonly tokenTtl: number;
    }

    const config = new Config();

    expect(typeof config.tokenTtl).toBe(typeof 1);
    expect(config.tokenTtl).toBe(3600);
  });

  it('Should throw ConfigTransformError if transform throws', () => {
    process.env.ETH_PRIVATE_KEY = '0xdeadbeef';

    const scamTransformer = (): never => {
      throw new Error('Scammed');
    };

    const initializer = (): void => {
      class Config {
        @UseEnv('ETH_PRIVATE_KEY', scamTransformer)
        public readonly ethPrivateKey: string;
      }
      const c = new Config();

      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      c.ethPrivateKey;
    };

    expect(initializer).toThrow();
  });
});

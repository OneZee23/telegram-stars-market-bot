import { UseEnvs } from '@common/config/use-envs.decorator';

describe('"Use-envs" decorator', () => {
  it('Should build array from envs under regex', () => {
    process.env.TARGET_1_ADDRESS = '0xdeadbeef';
    process.env.TARGET_2_ADDRESS = '0xbass';
    process.env.TARGET_35_ADDRESS = 'asjdoansdak';

    class Config {
      @UseEnvs(/^TARGET_\d+_ADDRESS$/)
      public readonly addresses: string[];
    }

    const config = new Config();

    expect(config.addresses).toBeInstanceOf(Array);
    expect(config.addresses.length).toBe(3);
    expect(config.addresses).toContain('0xdeadbeef');
    expect(config.addresses).toContain('0xbass');
  });

  it('Should transform collected envs if transformed provided', () => {
    process.env.MAGIC_NUMBER_0 = '100';
    process.env.MAGIC_NUMBER_10 = '345344';
    process.env.MAGIC_NUMBER_999aa9 = '7777000777';
    process.env['MAGIC_NUMBER_!sas!99a9'] = '1111111';

    class Config {
      @UseEnvs(/^MAGIC_NUMBER_\w+$/, parseInt)
      public readonly magicNumbers: number[];
    }

    const config = new Config();

    expect(config.magicNumbers).toBeInstanceOf(Array);
    expect(config.magicNumbers.length).toBe(3);
    expect(config.magicNumbers).toContain(100);
    expect(config.magicNumbers).toContain(345344);
  });

  it('Should ConfigTransformError if one of transformers throws', () => {
    process.env.HOME_AA_ADDRESS = '100';
    process.env.HOME_BA_ADDRESS = 'deadbeef';

    const scamTransformer = (env: string): void => {
      if (env === '100') {
        throw new Error('Scammed');
      }
    };

    const initializer = (): void => {
      class Config {
        @UseEnvs(/^HOME_\w+_ADDRESS$/, scamTransformer)
        public readonly addresses: string[];
      }

      const c = new Config();
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      c.addresses;
    };

    expect(initializer).toThrow();
  });
});

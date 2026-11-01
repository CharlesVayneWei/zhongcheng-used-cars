import Link from 'next/link';
import { CarVisual } from '@/components/cars/car-visual';
import { ContactDialogTrigger } from '@/components/contact/contact-dialog';
import { dataSourceState, getLatestCars } from '@/lib/data/cars';
import { formatMileage, formatWan } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const cars = await getLatestCars(6);
  const featured = cars[0];
  const source = dataSourceState();

  return (
    <div className="home-page">
      <section className="home-panel home-panel--hero" aria-labelledby="home-title">
        <div className="home-panel__image home-panel__image--tesla" aria-hidden="true" />
        <div className="home-panel__shade home-panel__shade--hero" aria-hidden="true" />
        <div className="page-width home-panel__content home-panel__content--hero">
          <div className="home-copy home-copy--hero">
            <p className="home-kicker">ZHONGCHENG JINGPIN / 精选车源</p>
            <h1 id="home-title" className="home-heading home-heading--hero">每一辆，<br />都值得认真选择。</h1>
            <p className="home-description">真实里程、清晰价格、原始车况，让下一段旅程从一次安心选择开始。</p>
            <div className="home-actions">
              <Link href="/cars" className="home-button home-button--light">探索全部车源 <span aria-hidden="true">↗</span></Link>
              <a href="#featured" className="home-button home-button--outline">向下探索 <span aria-hidden="true">↓</span></a>
            </div>
          </div>
          <span className="home-panel__index">01 / 05</span>
        </div>
      </section>

      <section id="featured" className="home-panel home-panel--featured" aria-labelledby="featured-title">
        <div className="home-panel__image home-panel__image--porsche" aria-hidden="true" />
        <div className="home-panel__shade home-panel__shade--featured" aria-hidden="true" />
        <div className="page-width home-panel__content home-panel__content--featured">
          <div className="home-copy">
            <p className="home-kicker">THE EDIT / 本周精选</p>
            <h2 id="featured-title" className="home-heading">为热爱，<br />留一个位置。</h2>
            <p className="home-description">从设计到驾驶感，每一处心动都值得细看。精选车源的真实信息，点击即可了解。</p>
          </div>
          {featured ? (
            <Link href={`/cars/${featured.id}`} className="home-feature-card group">
              <div className="home-feature-card__image"><CarVisual car={featured} className="transition duration-500 group-hover:scale-105" /></div>
              <div className="home-feature-card__body">
                <p className="home-feature-card__label">在售车源 · 本周精选</p>
                <h3>{featured.title}</h3>
                <p>{featured.registration_year} · {featured.registration_city} · {formatMileage(featured.mileage_km)}</p>
                <div className="home-feature-card__bottom"><strong>{formatWan(featured.cash_price_yuan)}</strong><span aria-hidden="true">↗</span></div>
              </div>
            </Link>
          ) : (
            <div className="home-feature-card home-feature-card--empty">
              <p className="home-feature-card__label">本周精选</p>
              <h3>好车，即将登场。</h3>
              <p>新的在售车源发布后，会第一时间出现在这里。</p>
              <Link href="/cars" className="home-text-link">浏览全部车源 <span aria-hidden="true">↗</span></Link>
            </div>
          )}
          <span className="home-panel__index">02 / 05</span>
        </div>
      </section>

      <section id="latest" className="home-panel home-panel--latest" aria-labelledby="latest-title">
        <div className="home-panel__image home-panel__image--mercedes" aria-hidden="true" />
        <div className="home-panel__shade home-panel__shade--latest" aria-hidden="true" />
        <div className="page-width home-panel__content home-panel__content--latest">
          <div className="home-copy">
            <p className="home-kicker">JUST ARRIVED / 最新到店</p>
            <h2 id="latest-title" className="home-heading">下一辆心动，<br />已经在路上。</h2>
            <p className="home-description">看见实车，了解真实信息。每辆车的年份、里程与价格，都清楚呈现。</p>
          </div>
          <div className="home-arrivals">
            {!source.configured && !source.demo && <p className="home-arrivals__notice">数据库尚未配置，请设置服务端 DATABASE_URL。</p>}
            {cars.length ? cars.slice(0, 3).map((car) => (
              <Link key={car.id} href={`/cars/${car.id}`} className="home-arrival group">
                <div className="home-arrival__image"><CarVisual car={car} className="transition duration-500 group-hover:scale-105" /></div>
                <div className="home-arrival__details">
                  <span>{car.brand || '精选车源'} · {car.registration_year || '年份待补'}</span>
                  <strong>{car.title}</strong>
                  <small>{car.registration_city || '上牌地待补'} · {formatMileage(car.mileage_km)}</small>
                </div>
                <span className="home-arrival__price">{formatWan(car.cash_price_yuan)}</span>
              </Link>
            )) : <p className="home-arrivals__empty">暂无在售车辆，新车源发布后会在这里展示。</p>}
            <Link href="/cars" className="home-arrivals__all">查看全部车源 <span aria-hidden="true">↗</span></Link>
          </div>
          <span className="home-panel__index">03 / 05</span>
        </div>
      </section>

      <section className="home-panel home-panel--promise" aria-labelledby="promise-title">
        <div className="home-panel__image home-panel__image--bmw" aria-hidden="true" />
        <div className="home-panel__shade home-panel__shade--promise" aria-hidden="true" />
        <div className="page-width home-panel__content home-panel__content--promise">
          <div className="home-copy home-copy--dark">
            <p className="home-kicker">OUR STANDARD / 选择的底气</p>
            <h2 id="promise-title" className="home-heading">喜欢一辆车，<br />也要了解它的一切。</h2>
          </div>
          <div className="home-standards">
            <div><span>01</span><h3>真实信息</h3><p>车辆参数和车况来自实际录入，信息直接呈现。</p></div>
            <div><span>02</span><h3>清晰价格</h3><p>全款、分期与首付分开查看，选择更从容。</p></div>
            <div><span>03</span><h3>便捷咨询</h3><p>看到合适的车，随时通过电话或微信联系。</p></div>
          </div>
          <span className="home-panel__index home-panel__index--dark">04 / 05</span>
        </div>
      </section>

      <section className="home-panel home-panel--closing" aria-labelledby="closing-title">
        <div className="home-panel__image home-panel__image--audi" aria-hidden="true" />
        <div className="home-panel__shade home-panel__shade--closing" aria-hidden="true" />
        <div className="page-width home-panel__content home-panel__content--closing">
          <div className="home-copy home-copy--dark">
            <p className="home-kicker">YOUR NEXT CHAPTER / 即刻出发</p>
            <h2 id="closing-title" className="home-heading">好车，不必将就。</h2>
            <p className="home-description">从喜欢的样子开始，找到真正适合你的那一辆。</p>
            <div className="home-actions">
              <Link href="/cars" className="home-button home-button--dark">查看在售车源 <span aria-hidden="true">↗</span></Link>
              <ContactDialogTrigger className="home-button home-button--outline-dark" icon="↗" />
            </div>
          </div>
          <span className="home-panel__index home-panel__index--dark">05 / 05</span>
        </div>
      </section>
    </div>
  );
}

import Telegraf from 'telegraf'
import SocksAgent from 'socks5-https-client/lib/Agent'

import fs from 'fs'

import concat from 'lodash/concat'
import forEach from 'lodash/forEach'
import filter from 'lodash/filter'
import get from 'lodash/get'
import isEmpty from 'lodash/isEmpty'
import isEqual from 'lodash/isEqual'
import join from 'lodash/join'
import map from 'lodash/map'
import pick from 'lodash/pick'
import replace from 'lodash/replace'
import some from 'lodash/some'
import toNumber from 'lodash/toNumber'
import trim from 'lodash/trim'
import truncate from 'lodash/truncate'
import uniqWith from 'lodash/uniqWith'

const socksAgent = new SocksAgent({
  socksHost: process.env.PROXY_HOST,
  socksPort: process.env.PROXY_PORT,
  socksUsername: process.env.PROXY_LOGIN,
  socksPassword: process.env.PROXY_PASSWORD,
})

const isProductionMode = isEqual(process.env.MODE, 'production')

const isProxySet =
  process.env.PROXY_HOST &&
  process.env.PROXY_PORT &&
  process.env.PROXY_LOGIN &&
  process.env.PROXY_PASSWORD

const shouldUseProxy = !isProductionMode && isProxySet

const bot = new Telegraf(process.env.TELEGRAM_TOKEN, {
  telegram: {
    agent: shouldUseProxy ? socksAgent : null,
  },
})

const getUserIdByMessage = ctx => get(ctx, 'update.message.from.id')

const acceptableUsers = JSON.parse(process.env.ACCEPTABLE_USERS)

const isAcceptableUser = ctx =>
  some(acceptableUsers, userId => isEqual(getUserIdByMessage(ctx), userId))

const sendForbiddenMessage = ctx => ctx.reply('Доступ запрещён')

const reply = (ctx, fn) =>
  isAcceptableUser(ctx) ? fn() : sendForbiddenMessage(ctx)

const replyAll = message =>
  forEach(acceptableUsers, userId =>
    bot.telegram.sendMessage(userId, message, {
      parse_mode: 'HTML',
    }),
  )

const dataFile = './data.json'

const data = {
  add: group => {
    const myGroups = JSON.stringify(
      uniqWith(concat(data.get(), group), isEqual),
    )
    fs.writeFileSync(dataFile, myGroups, 'utf8')
  },
  get: () => {
    try {
      const data = fs.readFileSync(dataFile, 'utf8')
      return JSON.parse(data)
    } catch (error) {
      return []
    }
  },
  remove: groupId => {
    const myGroups = JSON.stringify(
      filter(data.get(), ({ id }) => id !== groupId),
    )
    fs.writeFileSync(dataFile, myGroups, 'utf8')
  },
}

const isPrivateMessage = ctx =>
  get(ctx, 'update.message.chat.type') === 'private'

bot.start(ctx => {
  const message =
    'Салам алейкум, брат\n\nЧтобы посмотреть список добавленных групп ' +
    'отправь команду /groups, для того, чтобы удалить группу из списка' +
    'отправь команду /remove {id-группы}, чтобы разослать сообщения во все ' +
    'группы, просто отправь мне соответствующий текст'
  if (isPrivateMessage(ctx)) {
    reply(ctx, () => ctx.replyWithHTML(message))
  }
})

bot.command('groups', ctx => {
  if (isPrivateMessage(ctx)) {
    const myGroups = data.get()
    const message = join(
      map(
        myGroups,
        ({ id, title }) => `<b>ID</b>: ${id}\n<b>Название</b>: ${title}`,
      ),
      '\n\n',
    )
    reply(ctx, () => {
      if (isEmpty(myGroups)) {
        ctx.reply('Список групп пуст')
      } else {
        ctx.replyWithHTML(`<b>Список добавленных групп:</b>\n\n${message}`)
      }
    })
  } else {
    sendForbiddenMessage(ctx)
  }
})

bot.on('new_chat_members', ctx => {
  const botId = get(ctx, 'botInfo.id')
  const newChatMemberId = get(ctx, 'update.message.new_chat_participant.id')
  if (isEqual(botId, newChatMemberId)) {
    const chat = pick(get(ctx, 'update.message.chat'), ['id', 'title'])
    data.add(chat)
    replyAll(`Бот был успешно добавлен в чат <b>${chat.title}</b>`)
  }
})

bot.command('remove', ctx => {
  if (isPrivateMessage(ctx)) {
    const groupId = trim(
      replace(get(ctx, 'update.message.text'), '/remove', ''),
    )
    if (isEmpty(groupId)) {
      ctx.reply(
        'Необходимо указать ID группы, отправьте сообщение в формате "/remove {ID-Группы}"',
      )
    } else {
      data.remove(toNumber(groupId))
      replyAll(`Бот был успешно удалён из чата <b>${groupId}</b>`)
    }
  } else {
    sendForbiddenMessage(ctx)
  }
})

bot.on('message', ctx => {
  if (isPrivateMessage(ctx)) {
    if (isAcceptableUser(ctx)) {
      const myGroups = data.get()
      const message = get(ctx, 'update.message.text')
      forEach(myGroups, async ({ id, title }) => {
        const truncatedMessage = truncate(replace(message, '\n', ' '), {
          length: 32,
          separator: ' ',
        })
        try {
          await bot.telegram.sendMessage(id, message, {
            parse_mode: 'HTML',
          })
          ctx.replyWithHTML(
            `Сообщение "${truncatedMessage}" было успешно добавлено в группу <b>${title}</b>`,
          )
        } catch (error) {
          ctx.reply(`Ошибка отправки сообщения "${truncatedMessage}": ${error}`)
        }
      })
    } else {
      sendForbiddenMessage(ctx)
    }
  }
})

bot.launch()
